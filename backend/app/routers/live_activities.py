import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.live_activity import LiveActivity
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.live_activity import LiveActivityOut, LiveActivityStart, LiveActivityUpdate

router = APIRouter(prefix="/activities/live", tags=["live-activities"])


def _get_own_live_activity_or_404(db: Session, current_user: User, activity_id: str) -> LiveActivity:
    try:
        parsed_id = uuid.UUID(activity_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade ao vivo nao encontrada")

    activity = (
        db.query(LiveActivity)
        .filter(LiveActivity.id == parsed_id, LiveActivity.user_id == current_user.id)
        .first()
    )
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade ao vivo nao encontrada")
    return activity


def _trainer_has_access_to_student(db: Session, trainer_user: User, student_id: uuid.UUID) -> bool:
    trainer = db.query(Trainer).filter(Trainer.user_id == trainer_user.id).first()
    if not trainer:
        return False
    # Live Activity (acompanhar GPS ao vivo) e um contexto especifico de
    # personal trainer — nutricionista nao tem uso funcional pra isso.
    if trainer.professional_type != "personal_trainer":
        return False
    subscription = (
        db.query(Subscription)
        .filter(
            Subscription.trainer_id == trainer.id,
            Subscription.user_id == student_id,
            Subscription.type == "trainer_addon",
            Subscription.status == "active",
        )
        .first()
    )
    return subscription is not None


@router.post("/start", response_model=LiveActivityOut, status_code=status.HTTP_201_CREATED)
def start_live_activity(
    payload: LiveActivityStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cria o registro efemero que o professor vai acompanhar. Se ja havia um
    (ex: o app fechou no meio do treino anterior sem chamar /finish), ele e
    substituido — um aluno so tem uma atividade ao vivo por vez.
    """
    db.query(LiveActivity).filter(LiveActivity.user_id == current_user.id).delete()

    now = datetime.utcnow()
    activity = LiveActivity(
        user_id=current_user.id,
        activity_type=payload.activity_type,
        started_at=now,
        last_updated_at=now,
        distance_meters=0.0,
        elapsed_seconds=0,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.post("/{activity_id}/update", response_model=LiveActivityOut)
def update_live_activity(
    activity_id: str,
    payload: LiveActivityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    activity = _get_own_live_activity_or_404(db, current_user, activity_id)

    activity.last_lat = payload.lat
    activity.last_lng = payload.lng
    activity.distance_meters = payload.distance_meters
    activity.elapsed_seconds = payload.elapsed_seconds
    activity.pace_seconds_per_km = payload.pace_seconds_per_km
    activity.heart_rate_bpm = payload.heart_rate_bpm
    activity.last_updated_at = datetime.utcnow()

    db.commit()
    db.refresh(activity)
    return activity


@router.post("/{activity_id}/finish", status_code=status.HTTP_204_NO_CONTENT)
def finish_live_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    activity = _get_own_live_activity_or_404(db, current_user, activity_id)
    db.delete(activity)
    db.commit()


@router.get("/{activity_id}", response_model=LiveActivityOut)
def get_live_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    O proprio aluno sempre pode ver a propria atividade; um professor so se
    tiver uma assinatura ativa com o aluno dono dela. Sem essa relacao, 404
    em vez de 403 — nao revela nem que a atividade existe.
    """
    try:
        parsed_id = uuid.UUID(activity_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade ao vivo nao encontrada")

    activity = db.query(LiveActivity).filter(LiveActivity.id == parsed_id).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade ao vivo nao encontrada")

    is_owner = activity.user_id == current_user.id
    if not is_owner and not _trainer_has_access_to_student(db, current_user, activity.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade ao vivo nao encontrada")

    return activity
