import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TrainerRegister(BaseModel):
    cref_number: str
    bio: str | None = None
    price: float = Field(..., gt=0)


class TrainerUpdate(BaseModel):
    bio: str | None = None
    price: float | None = Field(None, gt=0)


class TrainerOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    cref_number: str
    cref_verified: bool
    bio: str | None = None
    price: float
    active: bool
    platform_fee_percent: float
    created_at: datetime

    class Config:
        from_attributes = True
