import logging
import uuid
from datetime import datetime, timedelta

import anthropic
import openai
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.heart_rate import HeartRateSample
from app.models.run import Run
from app.models.user import User
from app.schemas.activity_insight import ActivityInsightOut
from app.schemas.run import RunCreate, RunDetailOut, RunOut, RunSummaryOut
from app.services.activity_insight import generate_activity_insight
from app.services.run_calculator import (
    calculate_avg_pace_seconds_per_km,
    calculate_calories_burned,
    calculate_distance_meters,
    calculate_duration_seconds,
)

router = APIRouter(prefix="/runs", tags=["runs"])
logger = logging.getLogger(__name__)


@router.post("/", response_model=RunOut, status_code=status.HTTP_201_CREATED)
def create_run(
    payload: RunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe a rota bruta (lat/lng/timestamp) do app mobile e calcula
    distancia, duracao, pace e calorias no backend — nunca confia em
    metricas ja calculadas no cliente.
    """
    distance_meters = calculate_distance_meters(payload.route_points)
    duration_seconds = calculate_duration_seconds(payload.started_at, payload.finished_at)
    avg_pace = calculate_avg_pace_seconds_per_km(distance_meters, duration_seconds)
    weight_kg = payload.user_weight_kg or current_user.weight
    calories = calculate_calories_burned(payload.activity_type, distance_meters, duration_seconds, weight_kg)

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
    return run


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
