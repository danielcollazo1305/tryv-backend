import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.workout import WorkoutPlan, WorkoutSession
from app.schemas.workout import WorkoutLastExerciseOut, WorkoutSessionCreate, WorkoutSessionOut

router = APIRouter(prefix="/workout-sessions", tags=["workout-sessions"])
logger = logging.getLogger(__name__)

# Quantas sessoes recentes do usuario escanear procurando o exercicio —
# workout_sessions.exercises e JSON solto (sem indice de banco no nome do
# exercicio dentro do array), entao a busca e feita em Python sobre as
# sessoes mais recentes, nao via query SQL no conteudo do JSON. 200 cobre
# bastante historico (a maioria dos usuarios nao chega perto disso tao
# cedo) sem escanear a tabela inteira pra sempre.
_LAST_EXERCISE_SCAN_LIMIT = 200


@router.post("/", response_model=WorkoutSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: WorkoutSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Registra uma sessao de treino fora do fluxo POST /workout-plans/{id}/sessions
    (que exige plano na URL) — cobre a sessao "livre" (exercicios escolhidos
    manualmente, sem plano nenhum) e tambem aceita `plan_id` no corpo pra
    quem quiser registrar contra um plano existente por este mesmo endpoint.
    Sem plan_id, day/focus podem ficar None (nao ha "dia"/"foco" de plano
    pra registrar numa sessao livre).
    """
    plan_id: uuid.UUID | None = None
    if payload.plan_id is not None:
        plan = (
            db.query(WorkoutPlan)
            .filter(WorkoutPlan.id == payload.plan_id, WorkoutPlan.user_id == current_user.id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano nao encontrado")
        plan_id = plan.id

    session = WorkoutSession(
        plan_id=plan_id,
        user_id=current_user.id,
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


@router.get("/", response_model=list[WorkoutSessionOut])
def list_sessions(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista sessoes de treino do usuario (de plano OU livre), com filtro
    opcional por intervalo de completed_at. Usada pelos marcadores de
    "atividade" da tela de detalhe de Frequencia cardiaca — treino de
    forca (workout_sessions) e mais uma fonte de atividade ali, ao lado de
    corrida/pedalada/natacao (services/activities.ts) e sono (HealthKit).
    """
    query = db.query(WorkoutSession).filter(WorkoutSession.user_id == current_user.id)
    if start_date is not None:
        query = query.filter(WorkoutSession.completed_at >= start_date)
    if end_date is not None:
        query = query.filter(WorkoutSession.completed_at <= end_date)
    return query.order_by(WorkoutSession.completed_at.desc()).all()


@router.get("/last-exercise", response_model=WorkoutLastExerciseOut | None)
def get_last_exercise(
    exercise_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Peso/reps da ultima vez que este exercicio (por NOME, case/espaco
    insensivel) foi registrado por este usuario — cobre sessao de plano E
    sessao livre, ja que busca em TODAS as sessoes do usuario (user_id
    direto na tabela, nao via plan_id) sem filtrar por origem. Devolve None
    (200 com corpo null) quando nunca foi registrado, em vez de 404 — nao e
    um erro, e o estado normal da primeira vez que alguem faz um exercicio.
    """
    target = exercise_name.strip().lower()
    sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == current_user.id)
        .order_by(WorkoutSession.completed_at.desc())
        .limit(_LAST_EXERCISE_SCAN_LIMIT)
        .all()
    )
    for session in sessions:
        logged_exercises = (session.exercises or {}).get("exercises") or []
        for logged in logged_exercises:
            if (logged.get("name") or "").strip().lower() == target:
                sets = logged.get("sets") or []
                if sets:
                    return WorkoutLastExerciseOut(
                        exercise_name=logged.get("name"),
                        completed_at=session.completed_at,
                        sets=sets,
                    )
    return None
