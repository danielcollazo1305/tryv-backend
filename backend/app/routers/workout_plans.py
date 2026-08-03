import logging
import uuid

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_pro_subscription
from app.models.user import User
from app.models.workout import WorkoutPlan
from app.schemas.workout import (
    WorkoutGenerateRequest,
    WorkoutPlanCreate,
    WorkoutPlanGenerated,
    WorkoutPlanOut,
)
from app.services.workout_generator import generate_workout_plan

router = APIRouter(prefix="/workout-plans", tags=["workout-plans"])
logger = logging.getLogger(__name__)


@router.post("/generate", response_model=WorkoutPlanGenerated)
def generate(
    payload: WorkoutGenerateRequest,
    current_user: User = Depends(require_pro_subscription),
):
    """
    Gera um plano de treino semanal via IA e retorna o resultado.
    Nao grava nada no banco — o cliente confirma (ou ajusta) o plano e
    chama POST /workout-plans para registrar de verdade.
    """
    try:
        return generate_workout_plan(
            goal=payload.goal,
            level=payload.level,
            days_per_week=payload.days_per_week,
            equipment=payload.equipment,
            notes=payload.notes,
        )
    except (anthropic.APIError, ValueError) as e:
        logger.error("Falha ao gerar plano de treino (user_id=%s): %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nao foi possivel gerar o plano de treino, tente novamente",
        )


@router.post("/", response_model=WorkoutPlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: WorkoutPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = WorkoutPlan(
        user_id=current_user.id,
        source=payload.source,
        plan_data=payload.plan_data.model_dump(),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/", response_model=list[WorkoutPlanOut])
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(WorkoutPlan)
        .filter(WorkoutPlan.user_id == current_user.id)
        .order_by(WorkoutPlan.created_at.desc())
        .all()
    )


@router.get("/{plan_id}", response_model=WorkoutPlanOut)
def get_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano nao encontrado")

    plan = (
        db.query(WorkoutPlan)
        .filter(WorkoutPlan.id == parsed_id, WorkoutPlan.user_id == current_user.id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano nao encontrado")
    return plan
