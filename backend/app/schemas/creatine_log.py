import uuid
from datetime import date

from pydantic import BaseModel


class CreatineLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    logged_at: date

    class Config:
        from_attributes = True


class CreatineTodayOut(BaseModel):
    taken_today: bool
