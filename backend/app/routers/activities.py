import logging
import uuid

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.manual_activity import ManualActivity
from app.models.user import User
from app.schemas.activity_insight import ActivityInsightOut
from app.schemas.manual_activity import ManualActivityCreate, ManualActivityOut
from app.services.activity_insight import generate_activity_insight

router = APIRouter(prefix="/activities", tags=["activities"])
logger = logging.getLogger(__name__)


@router.post("/manual", response_model=ManualActivityOut, status_code=status.HTTP_201_CREATED)
def create_manual_activity(
    payload: ManualActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    activity = ManualActivity(user_id=current_user.id, **payload.model_dump())
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.get("/manual", response_model=list[ManualActivityOut])
def list_manual_activities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ManualActivity)
        .filter(ManualActivity.user_id == current_user.id)
        .order_by(ManualActivity.performed_at.desc())
        .all()
    )


def _get_manual_activity_or_404(db: Session, current_user: User, activity_id: str) -> ManualActivity:
    try:
        parsed_id = uuid.UUID(activity_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade nao encontrada")

    activity = (
        db.query(ManualActivity)
        .filter(ManualActivity.id == parsed_id, ManualActivity.user_id == current_user.id)
        .first()
    )
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade nao encontrada")
    return activity


@router.get("/manual/{activity_id}", response_model=ManualActivityOut)
def get_manual_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_manual_activity_or_404(db, current_user, activity_id)


@router.get("/manual/{activity_id}/insight", response_model=ActivityInsightOut)
def get_manual_activity_insight(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Interpretacao da atividade manual via IA, gerada sob demanda (nao e salva)."""
    activity = _get_manual_activity_or_404(db, current_user, activity_id)

    activity_data = {
        "activity_type": activity.activity_type,
        "duration_minutes": activity.duration_minutes,
        "calories_burned": activity.calories_burned,
        "notes": activity.notes,
    }

    try:
        return generate_activity_insight(activity_data)
    except (anthropic.APIError, ValueError) as e:
        logger.error("Falha ao gerar insight de atividade manual (activity_id=%s): %s", activity.id, e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nao foi possivel gerar a interpretacao desta atividade, tente novamente",
        )
