import logging
import uuid
from datetime import datetime, timedelta

import anthropic
import openai
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, has_active_pro_subscription, require_pro_subscription
from app.models.heart_rate import HeartRateSample
from app.models.run import Run
from app.models.user import User
from app.schemas.activity_insight import ActivityInsightOut
from app.schemas.run import (
    ActivityTypeRecordsOut,
    DistanceRecordOut,
    DurationRecordOut,
    PaceRecordOut,
    PersonalRecordsOut,
    RunCreate,
    RunCreateOut,
    RunDetailOut,
    RunOut,
    RunSummaryOut,
)
from app.services.activity_insight import generate_activity_insight
from app.services.personal_records import ActivityRecords, compute_personal_records, detect_new_prs
from app.services.run_calculator import (
    calculate_avg_pace_seconds_per_km,
    calculate_calories_burned,
    calculate_distance_meters,
    calculate_duration_seconds,
)

router = APIRouter(prefix="/runs", tags=["runs"])
logger = logging.getLogger(__name__)


@router.post("/", response_model=RunCreateOut, status_code=status.HTTP_201_CREATED)
def create_run(
    payload: RunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe a rota bruta (lat/lng/timestamp) do app mobile e calcula
    distancia, duracao, pace e calorias no backend — nunca confia em
    metricas ja calculadas no cliente.

    Salvar uma corrida continua livre pra qualquer usuario (esse endpoint
    nunca foi gated) — so o campo new_prs (recordes pessoais) e um atrativo
    Pro, entao fica vazio pra quem nao e Pro em vez de bloquear o save.
    """
    distance_meters = calculate_distance_meters(payload.route_points)
    duration_seconds = calculate_duration_seconds(payload.started_at, payload.finished_at)
    avg_pace = calculate_avg_pace_seconds_per_km(distance_meters, duration_seconds)
    weight_kg = payload.user_weight_kg or current_user.weight
    calories = calculate_calories_burned(payload.activity_type, distance_meters, duration_seconds, weight_kg)

    # Calculado ANTES do commit da corrida nova — assim a query de "recorde
    # anterior" nunca ve a propria linha que esta sendo comparada.
    is_pro = has_active_pro_subscription(db, current_user.id)
    previous_records: ActivityRecords | None = None
    if is_pro:
        previous_records = compute_personal_records(db, current_user.id).get(payload.activity_type)

    run = Run(
        user_id=current_user.id,
        activity_type=payload.activity_type,
        route_points=[point.model_dump(mode="json") for point in payload.route_points],
        distance_meters=distance_meters,
        duration_seconds=duration_seconds,
        avg_pace_seconds_per_km=avg_pace,
        calories_burned=calories,
        started_at=payload.started_at,
        finished_at=payload.finished_at,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    new_prs = detect_new_prs(run, previous_records) if is_pro else []
    return RunCreateOut(**RunOut.model_validate(run).model_dump(), new_prs=new_prs)


@router.get("/", response_model=list[RunOut])
def list_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Run)
        .filter(Run.user_id == current_user.id)
        .order_by(Run.started_at.desc())
        .all()
    )


@router.get("/summary", response_model=RunSummaryOut)
def summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resumo agregado dos ultimos 30 dias (distancia total, tempo total, pace medio)."""
    end = datetime.utcnow()
    start = end - timedelta(days=30)

    rows = (
        db.query(Run)
        .filter(
            Run.user_id == current_user.id,
            Run.started_at >= start,
            Run.started_at <= end,
        )
        .all()
    )

    total_distance = sum(row.distance_meters for row in rows)
    total_duration = sum(row.duration_seconds for row in rows)

    return RunSummaryOut(
        start_date=start,
        end_date=end,
        total_runs=len(rows),
        total_distance_meters=total_distance,
        total_duration_seconds=total_duration,
        avg_pace_seconds_per_km=calculate_avg_pace_seconds_per_km(total_distance, total_duration),
    )


def _to_activity_type_records_out(records: ActivityRecords) -> ActivityTypeRecordsOut:
    return ActivityTypeRecordsOut(
        longest_distance=(
            DistanceRecordOut(
                distance_meters=records.longest_distance.distance_meters,
                run_id=records.longest_distance.id,
                achieved_at=records.longest_distance.started_at,
            )
            if records.longest_distance
            else None
        ),
        longest_duration=(
            DurationRecordOut(
                duration_seconds=records.longest_duration.duration_seconds,
                run_id=records.longest_duration.id,
                achieved_at=records.longest_duration.started_at,
            )
            if records.longest_duration
            else None
        ),
        best_pace_by_reference={
            label: PaceRecordOut(
                avg_pace_seconds_per_km=run.avg_pace_seconds_per_km,
                distance_meters=run.distance_meters,
                run_id=run.id,
                achieved_at=run.started_at,
            )
            for label, run in records.best_pace_by_reference.items()
        },
    )


@router.get("/personal-records", response_model=PersonalRecordsOut)
def get_personal_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    """
    Recordes pessoais por modalidade — maior distancia, maior duracao,
    melhor pace perto de 1km/5km/10km (tolerancia +-10%). Calculado sob
    demanda a cada chamada, sem cache: o historico de corridas por usuario
    e pequeno o suficiente pra isso ser barato (mesmo espirito de
    GET /runs/summary).
    """
    records = compute_personal_records(db, current_user.id)
    return PersonalRecordsOut(
        records_by_activity_type={
            activity_type: _to_activity_type_records_out(activity_records)
            for activity_type, activity_records in records.items()
        }
    )


def _get_run_or_404(db: Session, current_user: User, run_id: str) -> Run:
    try:
        parsed_id = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrida nao encontrada")

    run = (
        db.query(Run)
        .filter(Run.id == parsed_id, Run.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrida nao encontrada")
    return run


def _heart_rate_stats(
    db: Session, current_user: User, start: datetime, end: datetime
) -> tuple[float | None, int | None]:
    """Media e maxima de BPM entre start..end — calculado sob demanda, nunca armazenado."""
    bpms = [
        row.bpm
        for row in db.query(HeartRateSample.bpm)
        .filter(
            HeartRateSample.user_id == current_user.id,
            HeartRateSample.recorded_at >= start,
            HeartRateSample.recorded_at <= end,
        )
        .all()
    ]
    if not bpms:
        return None, None
    return sum(bpms) / len(bpms), max(bpms)


@router.get("/{run_id}", response_model=RunDetailOut)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = _get_run_or_404(db, current_user, run_id)
    heart_rate_avg, heart_rate_max = _heart_rate_stats(db, current_user, run.started_at, run.finished_at)

    return RunDetailOut(
        **RunOut.model_validate(run).model_dump(),
        heart_rate_avg=heart_rate_avg,
        heart_rate_max=heart_rate_max,
    )


@router.get("/{run_id}/insight", response_model=ActivityInsightOut)
def get_run_insight(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Interpretacao da corrida via IA, gerada sob demanda (nao e salva)."""
    run = _get_run_or_404(db, current_user, run_id)
    heart_rate_avg, heart_rate_max = _heart_rate_stats(db, current_user, run.started_at, run.finished_at)

    activity_data = {
        "activity_type": run.activity_type,
        "duration_seconds": run.duration_seconds,
        "distance_meters": run.distance_meters,
        "avg_pace_seconds_per_km": run.avg_pace_seconds_per_km,
        "calories_burned": run.calories_burned,
        "heart_rate_avg": heart_rate_avg,
        "heart_rate_max": heart_rate_max,
    }

    try:
        return generate_activity_insight(activity_data)
    except (anthropic.APIError, openai.APIError, ValueError) as e:
        logger.error("Falha ao gerar insight de corrida (run_id=%s): %s", run.id, e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nao foi possivel gerar a interpretacao desta atividade, tente novamente",
        )
