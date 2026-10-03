from datetime import date

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.creatine_log import CreatineLog
from app.models.user import User
from app.schemas.creatine_log import CreatineLogOut, CreatineTodayOut

router = APIRouter(prefix="/creatine-logs", tags=["creatine-logs"])


def _get_log_for_day(db: Session, user_id, day: date) -> CreatineLog | None:
    return db.query(CreatineLog).filter(CreatineLog.user_id == user_id, CreatineLog.logged_at == day).first()


@router.post("/", response_model=CreatineLogOut, status_code=status.HTTP_201_CREATED)
def mark_creatine_today(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Marca "tomei creatina hoje". Idempotente: se ja existe registro de hoje,
    devolve o existente (200 em vez de 201, mesmo padrao de POST /runs/) sem
    duplicar. A unique constraint (user_id, logged_at) cobre a corrida entre
    dois toques simultaneos -- o perdedor da corrida cai no IntegrityError e
    devolve o registro que o outro acabou de criar. Sem XP.
    """
    today = date.today()

    existing = _get_log_for_day(db, current_user.id, today)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing

    creatine_log = CreatineLog(user_id=current_user.id, logged_at=today)
    db.add(creatine_log)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        response.status_code = status.HTTP_200_OK
        return _get_log_for_day(db, current_user.id, today)
    db.refresh(creatine_log)
    return creatine_log


@router.get("/today", response_model=CreatineTodayOut)
def get_creatine_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return CreatineTodayOut(taken_today=_get_log_for_day(db, current_user.id, date.today()) is not None)
