import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.manual_activity import ManualActivity
from app.models.user import User
from app.schemas.manual_activity import ManualActivityCreate, ManualActivityOut

router = APIRouter(prefix="/activities", tags=["activities"])


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


@router.get("/manual/{activity_id}", response_model=ManualActivityOut)
def get_manual_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
