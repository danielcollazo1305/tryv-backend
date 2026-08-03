import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.activity_types import validate_activity_type


class LiveActivityStart(BaseModel):
    activity_type: str = "run"

    @field_validator("activity_type")
    @classmethod
    def _check_activity_type(cls, value: str) -> str:
        return validate_activity_type(value)


class LiveActivityUpdate(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    distance_meters: float = Field(..., ge=0)
    elapsed_seconds: int = Field(..., ge=0)
    pace_seconds_per_km: float | None = Field(None, ge=0)
    heart_rate_bpm: int | None = Field(None, ge=0)


class LiveActivityOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: str
    started_at: datetime
    last_updated_at: datetime
    last_lat: float | None = None
    last_lng: float | None = None
    distance_meters: float
    elapsed_seconds: int
    pace_seconds_per_km: float | None = None
    heart_rate_bpm: int | None = None

    class Config:
        from_attributes = True
