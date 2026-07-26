import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.activity_types import validate_activity_type


class ManualActivityCreate(BaseModel):
    activity_type: str
    duration_minutes: int = Field(..., gt=0)
    calories_burned: float | None = None
    notes: str | None = None
    performed_at: datetime

    @field_validator("activity_type")
    @classmethod
    def _check_activity_type(cls, value: str) -> str:
        return validate_activity_type(value)


class ManualActivityOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: str
    duration_minutes: int
    calories_burned: float | None = None
    notes: str | None = None
    performed_at: datetime

    class Config:
        from_attributes = True
