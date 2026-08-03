from datetime import date

from pydantic import BaseModel


class ReadinessOut(BaseModel):
    date: date
    sleep_score: float | None = None
    load_score: float | None = None
    hr_score: float | None = None
    final_score: float
    recommendation_text: str | None = None

    class Config:
        from_attributes = True
