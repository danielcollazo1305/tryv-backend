import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.period import parse_period_days
from app.models.user import User
from app.models.weight_log import WeightLog
from app.schemas.weight_log import WeightLogCreate, WeightLogOut, WeightLogUpdate

router = APIRouter(prefix="/weight-logs", tags=["weight-logs"])


@router.post("/", response_model=WeightLogOut, status_code=status.HTTP_201_CREATED)
def create_weight_log(
    payload: WeightLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(WeightLog)
        .filter(WeightLog.user_id == current_user.id, WeightLog.logged_at == payload.logged_at)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ja existe um registro de peso para esta data — edite o existente em vez de criar outro",
        )

    weight_log = WeightLog(
        user_id=current_user.id,
        weight_kg=payload.weight_kg,
        logged_at=payload.logged_at,
    )
    db.add(weight_log)
    db.commit()
    db.refresh(weight_log)
    return weight_log


@router.get("/", response_model=list[WeightLogOut])
def list_weight_logs(
    period: str = Query("30d"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = date.today() - timedelta(days=parse_period_days(period) - 1)
    return (
        db.query(WeightLog)
        .filter(WeightLog.user_id == current_user.id, WeightLog.logged_at >= cutoff)
        .order_by(WeightLog.logged_at.asc())
        .all()
    )


def _get_owned_weight_log(db: Session, current_user: User, weight_log_id: str) -> WeightLog:
    try:
        parsed_id = uuid.UUID(weight_log_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de peso nao encontrado")

    weight_log = (
        db.query(WeightLog)
        .filter(WeightLog.id == parsed_id, WeightLog.user_id == current_user.id)
        .first()
    )
    if not weight_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de peso nao encontrado")
    return weight_log


@router.put("/{weight_log_id}", response_model=WeightLogOut)
def update_weight_log(
    weight_log_id: str,
    payload: WeightLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    weight_log = _get_owned_weight_log(db, current_user, weight_log_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(weight_log, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ja existe um registro de peso para esta data",
        )
    db.refresh(weight_log)
    return weight_log


@router.delete("/{weight_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weight_log(
    weight_log_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    weight_log = _get_owned_weight_log(db, current_user, weight_log_id)
    db.delete(weight_log)
    db.commit()
