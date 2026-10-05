from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.timezone import local_range_bounds
from app.models.points_event import PointsEvent
from app.models.run import Run
from app.models.user import User
from app.routers.dashboard import (
    _compute_training_frequency,
    _query_workout_sessions,
    _resolve_window,
    _session_stats,
)
from app.schemas.overall import OverallStatsOut

# Prefixo igual ao de dashboard.py, mas e um router proprio: o path final e
# /dashboard/overall. Nao colide com as rotas de dashboard.py ("/overall" nao
# casa com nenhum "/{user_id}" de la, que sempre vem depois de outro segmento).
router = APIRouter(prefix="/dashboard", tags=["dashboard"])

WINDOW_DAYS = 30
WEEKS_IN_WINDOW = WINDOW_DAYS / 7
STRENGTH_CEILING_KG_PER_WEEK = 15000
ENDURANCE_CEILING_KM = 100
DISCIPLINE_SOURCE_TYPES = ("protein_goal", "calorie_goal")


def _clamp_score(value: float) -> int:
    return round(max(0.0, min(100.0, value)))


@router.get("/overall", response_model=OverallStatsOut)
def get_overall(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Overall do perfil, sobre os ultimos 30 dias (hoje incluso). Cada atributo
    vai de 0 a 100 (clamp, mesmo se passar do teto) e o overall e a media
    simples dos 4, arredondada:
    - forca: volume medio semanal (peso x reps das series completas de todas
      as WorkoutSession / 30/7 semanas); 15000 kg/semana = 100.
    - resistencia: distancia total de Run com activity_type == 'run' (so
      corrida, sem bike/natacao/etc); 100 km = 100.
    - consistencia: dias com Run, ManualActivity ou WorkoutSession / 30.
    - disciplina: dias distintos com PointsEvent de meta de proteina ou
      caloria / 30.
    """
    start_date, end_date, days_total, _ = _resolve_window(f"{WINDOW_DAYS}d", None)
    # Janela em dias LOCAIS (herdada de _resolve_window); WHERE na coluna crua com limites UTC.
    start_utc, end_utc = local_range_bounds(start_date, end_date)

    sessions = _query_workout_sessions(db, current_user.id, start_utc, end_utc)
    total_volume_kg = sum(_session_stats(session)[1] for session in sessions)
    forca = _clamp_score(total_volume_kg / WEEKS_IN_WINDOW / STRENGTH_CEILING_KG_PER_WEEK * 100)

    run_meters = (
        db.query(func.coalesce(func.sum(Run.distance_meters), 0.0))
        .filter(
            Run.user_id == current_user.id,
            Run.activity_type == "run",
            Run.started_at >= start_utc,
            Run.started_at < end_utc,
        )
        .scalar()
    )
    resistencia = _clamp_score(run_meters / 1000 / ENDURANCE_CEILING_KM * 100)

    _, days_trained = _compute_training_frequency(db, current_user.id, start_date, end_date, days_total)
    consistencia = _clamp_score(days_trained / days_total * 100)

    goal_days = (
        db.query(func.count(func.distinct(PointsEvent.source_date)))
        .filter(
            PointsEvent.user_id == current_user.id,
            PointsEvent.source_type.in_(DISCIPLINE_SOURCE_TYPES),
            PointsEvent.source_date >= start_date,
            PointsEvent.source_date <= end_date,
        )
        .scalar()
    )
    disciplina = _clamp_score(goal_days / days_total * 100)

    overall = round((forca + resistencia + consistencia + disciplina) / 4)
    return OverallStatsOut(
        forca=forca,
        resistencia=resistencia,
        consistencia=consistencia,
        disciplina=disciplina,
        overall=overall,
    )
