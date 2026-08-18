import logging
import uuid
from datetime import datetime, timedelta

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_pro_subscription
from app.models.user import User
from app.models.workout import WorkoutPlan, WorkoutSession
from app.schemas.workout import (
    WorkoutGenerateRequest,
    WorkoutPlanCreate,
    WorkoutPlanGenerated,
    WorkoutPlanOut,
    WorkoutSessionCreate,
    WorkoutSessionOut,
)
from app.services.workout_generator import generate_workout_plan

router = APIRouter(prefix="/workout-plans", tags=["workout-plans"])
logger = logging.getLogger(__name__)

# Validade de plano gerado por IA — depois disso o plano continua acessivel
# (historico), mas deixa de contar como "plano ativo" nas telas que
# perguntam "o usuario tem um plano?" (Home, aba Treino). So se aplica a
# planos source='ai' — ver create_plan abaixo e o comentario em
# models/workout.py.
AI_WORKOUT_PLAN_VALIDITY = timedelta(weeks=8)


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
    expires_at = datetime.utcnow() + AI_WORKOUT_PLAN_VALIDITY if payload.source == "ai" else None

    plan = WorkoutPlan(
        user_id=current_user.id,
        source=payload.source,
        plan_data=payload.plan_data.model_dump(),
        expires_at=expires_at,
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


@router.post("/{plan_id}/sessions", response_model=WorkoutSessionOut, status_code=status.HTTP_201_CREATED)
def log_session(
    plan_id: str,
    payload: WorkoutSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Registra o que foi de fato executado num dia do plano (peso/reps por
    serie) — grava em workout_sessions, tabela que ja existia no banco mas
    ate agora nao tinha nenhum endpoint lendo/escrevendo nela. Reaproveitada
    como esta: a coluna `exercises` (JSON, sem schema fixo) comporta o
    payload inteiro (day/focus/exercises), entao nenhuma migration foi
    necessaria pra esta tarefa.
    """
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

    session = WorkoutSession(
        plan_id=plan.id,
        exercises={
            "day": payload.day,
            "focus": payload.focus,
            "exercises": [exercise.model_dump() for exercise in payload.exercises],
        },
        duration_minutes=payload.duration_minutes,
        calories_burned=payload.calories_burned,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
