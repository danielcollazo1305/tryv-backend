from datetime import datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.timezone import local_day_bounds, local_today
from app.models.user import User
from app.models.water_log import WaterLog
from app.schemas.water_log import WaterLogCreate, WaterLogOut, WaterTodayOut

router = APIRouter(prefix="/water-logs", tags=["water-logs"])


@router.post("/", response_model=WaterLogOut, status_code=status.HTTP_201_CREATED)
def create_water_log(
    payload: WaterLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sem XP de proposito: agua nao tem criterio objetivo de "meta batida"
    (nao ha meta de agua no User), e premiar cada registro seria farmavel."""
    water_log = WaterLog(
        user_id=current_user.id,
        amount_ml=payload.amount_ml,
        logged_at=payload.logged_at or datetime.utcnow(),
    )
    db.add(water_log)
    db.commit()
    db.refresh(water_log)
    return water_log


@router.get("/today", response_model=WaterTodayOut)
def get_water_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soma do dia LOCAL de hoje (core/timezone.py; mesma definicao de dia do
    dashboard/meals)."""
    start_utc, end_utc = local_day_bounds(local_today())
    total = (
        db.query(func.coalesce(func.sum(WaterLog.amount_ml), 0))
        .filter(
            WaterLog.user_id == current_user.id,
            WaterLog.logged_at >= start_utc,
            WaterLog.logged_at < end_utc,
        )
        .scalar()
    )
    return WaterTodayOut(total_ml=int(total))
