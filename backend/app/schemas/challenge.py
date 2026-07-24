import uuid
from datetime import datetime

from pydantic import BaseModel


class ChallengeCreate(BaseModel):
    title: str
    description: str | None = None
    start_date: datetime
    end_date: datetime


class ChallengeOut(BaseModel):
    id: uuid.UUID
    trainer_id: uuid.UUID
    title: str
    description: str | None = None
    start_date: datetime
    end_date: datetime
    participants_count: int
    created_at: datetime
