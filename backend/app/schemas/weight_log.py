import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class WeightLogCreate(BaseModel):
    weight_kg: float = Field(..., gt=0)
    logged_at: date


class WeightLogUpdate(BaseModel):
    weight_kg: float | None = Field(None, gt=0)
    logged_at: date | None = None


class WeightLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    weight_kg: float
    logged_at: date
    created_at: datetime

    class Config:
        from_attributes = True
