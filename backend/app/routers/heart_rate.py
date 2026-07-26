from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.heart_rate import HeartRateSample
from app.models.user import User
from app.schemas.heart_rate import HeartRateSampleOut, HeartRateSyncRequest

router = APIRouter(prefix="/heart-rate", tags=["heart-rate"])


@router.post("/sync", response_model=list[HeartRateSampleOut], status_code=status.HTTP_201_CREATED)
def sync_heart_rate(
    payload: HeartRateSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    samples = [
        HeartRateSample(
            user_id=current_user.id,
            source=payload.source,
            bpm=item.bpm,
            recorded_at=item.recorded_at,
        )
        for item in payload.samples
    ]
    db.add_all(samples)
    db.commit()
    for sample in samples:
        db.refresh(sample)
    return samples


@router.get("/", response_model=list[HeartRateSampleOut])
def list_heart_rate(
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(HeartRateSample)
        .filter(
            HeartRateSample.user_id == current_user.id,
            HeartRateSample.recorded_at >= start_time,
            HeartRateSample.recorded_at <= end_time,
        )
        .order_by(HeartRateSample.recorded_at.asc())
        .all()
    )
