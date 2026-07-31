import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    weight: float | None = None
    height: float | None = None
    goal: str | None = None
    daily_calorie_goal: float | None = None
    subscription_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    weight: float | None = Field(None, gt=0)
    height: float | None = Field(None, gt=0)
    goal: str | None = None
    daily_calorie_goal: float | None = Field(None, gt=0)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
