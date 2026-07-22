import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.run import Run
from app.models.user import User
from app.schemas.run import RunCreate, RunOut, RunSummaryOut
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
    calories = calculate_calories_burned(distance_meters, duration_seconds, weight_kg)

    run = Run(
        user_id=current_user.id,
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


@router.get("/{run_id}", response_model=RunOut)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
