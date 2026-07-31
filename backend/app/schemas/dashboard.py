from datetime import date

from pydantic import BaseModel


class WeightPoint(BaseModel):
    date: date
    weight_kg: float


class TrainingDay(BaseModel):
    date: date
    intensity: int  # 0 = sem treino, 1-2 = quantidade exata, 3 = "3 ou mais"


class CalorieSummary(BaseModel):
    avg_consumed: float
    avg_goal: float | None = None
    avg_deficit: float | None = None


class HomeSummaryOut(BaseModel):
    period: str
    weight_evolution: list[WeightPoint]
    weight_change_kg: float | None = None
    training_frequency: list[TrainingDay]
    days_trained: int
    days_total: int
    calorie_summary: CalorieSummary | None = None
