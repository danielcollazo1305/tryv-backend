import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

SmartwatchSource = Literal["healthkit", "googlefit", "fitbit", "garmin"]


class SmartwatchDataIn(BaseModel):
    source: SmartwatchSource
    recorded_date: date
    steps: int | None = None
    heart_rate_avg: float | None = None
    heart_rate_resting: float | None = None
    sleep_minutes: int | None = None
    calories_active: float | None = None


class SmartwatchDataOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source: str
    recorded_date: date
    steps: int | None = None
    heart_rate_avg: float | None = None
    heart_rate_resting: float | None = None
    sleep_minutes: int | None = None
    calories_active: float | None = None
    synced_at: datetime

    class Config:
        from_attributes = True


class SmartwatchSummaryOut(BaseModel):
    start_date: date
    end_date: date
    days_with_data: int
    avg_steps: float | None = None
    total_steps: int | None = None
    avg_heart_rate_avg: float | None = None
    avg_heart_rate_resting: float | None = None
    avg_sleep_minutes: float | None = None
    avg_calories_active: float | None = None
