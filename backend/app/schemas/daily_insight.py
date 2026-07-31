import uuid
from datetime import date, datetime

from pydantic import BaseModel


class DailyInsightOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    date: date
    insight_text: str
    category: str
    created_at: datetime

    class Config:
        from_attributes = True
