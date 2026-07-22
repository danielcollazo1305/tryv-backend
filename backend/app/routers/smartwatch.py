import logging
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.smartwatch import SmartwatchData
from app.models.user import User
from app.schemas.smartwatch import SmartwatchDataIn, SmartwatchDataOut, SmartwatchSummaryOut

router = APIRouter(prefix="/smartwatch", tags=["smartwatch"])
logger = logging.getLogger(__name__)


def _upsert_record(db: Session, user_id: uuid.UUID, record: SmartwatchDataIn) -> SmartwatchData:
    existing = (
        db.query(SmartwatchData)
        .filter(
            SmartwatchData.user_id == user_id,
            SmartwatchData.source == record.source,
            SmartwatchData.recorded_date == record.recorded_date,
        )
        .first()
    )
    fields = record.model_dump(exclude={"source", "recorded_date"})

    if existing:
        for key, value in fields.items():
            setattr(existing, key, value)
        existing.synced_at = datetime.utcnow()
        return existing

    entry = SmartwatchData(
        user_id=user_id,
        source=record.source,
        recorded_date=record.recorded_date,
        **fields,
    )
    db.add(entry)
    return entry


@router.post("/sync", response_model=list[SmartwatchDataOut])
def sync(
    payload: SmartwatchDataIn | list[SmartwatchDataIn],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe um ou mais registros do app mobile e faz upsert por
    (user_id, source, recorded_date) — reenviar o mesmo dia/fonte atualiza
    o registro existente em vez de duplicar.
    """
    records = payload if isinstance(payload, list) else [payload]

    # Se o mesmo (source, recorded_date) aparecer mais de uma vez no mesmo
    # lote, mantem soh o ultimo — evita tentar inserir duas linhas novas
    # para a mesma chave unica antes do commit.
    deduped: dict[tuple[str, date], SmartwatchDataIn] = {}
    for record in records:
        deduped[(record.source, record.recorded_date)] = record

    entries = [_upsert_record(db, current_user.id, record) for record in deduped.values()]
    db.commit()
    for entry in entries:
        db.refresh(entry)
    return entries


@router.get("/", response_model=list[SmartwatchDataOut])
def list_data(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    source: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(SmartwatchData).filter(SmartwatchData.user_id == current_user.id)
    if start_date:
        query = query.filter(SmartwatchData.recorded_date >= start_date)
    if end_date:
        query = query.filter(SmartwatchData.recorded_date <= end_date)
    if source:
        query = query.filter(SmartwatchData.source == source)
    return query.order_by(SmartwatchData.recorded_date.desc()).all()


@router.get("/summary", response_model=SmartwatchSummaryOut)
def summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resumo agregado dos ultimos 7 dias (incluindo hoje)."""
    end = date.today()
    start = end - timedelta(days=6)

    rows = (
        db.query(SmartwatchData)
        .filter(
            SmartwatchData.user_id == current_user.id,
            SmartwatchData.recorded_date >= start,
            SmartwatchData.recorded_date <= end,
        )
        .all()
    )

    def _clean(values):
        return [v for v in values if v is not None]

    def _avg(values):
        cleaned = _clean(values)
        return sum(cleaned) / len(cleaned) if cleaned else None

    def _total(values):
        cleaned = _clean(values)
        return sum(cleaned) if cleaned else None

    return SmartwatchSummaryOut(
        start_date=start,
        end_date=end,
        days_with_data=len({row.recorded_date for row in rows}),
        avg_steps=_avg([row.steps for row in rows]),
        total_steps=_total([row.steps for row in rows]),
        avg_heart_rate_avg=_avg([row.heart_rate_avg for row in rows]),
        avg_heart_rate_resting=_avg([row.heart_rate_resting for row in rows]),
        avg_sleep_minutes=_avg([row.sleep_minutes for row in rows]),
        avg_calories_active=_avg([row.calories_active for row in rows]),
    )
