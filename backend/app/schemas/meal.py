import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class MealAnalysisOut(BaseModel):
    """Resultado da analise de IA — nao e persistido; o usuario confirma
    (ou ajusta) os valores antes de registrar a refeicao de verdade."""
    description: str
    calories: float
    protein: float
    carbs: float
    fat: float
    confidence: str


class MealCreate(BaseModel):
    photo_url: str | None = None
    description: str | None = None
    calories: float = Field(..., ge=0)
    protein: float | None = Field(None, ge=0)
    carbs: float | None = Field(None, ge=0)
    fat: float | None = Field(None, ge=0)


class MealOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    photo_url: str | None = None
    description: str | None = None
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    logged_at: datetime

    class Config:
        from_attributes = True


MealsSummaryPeriod = Literal["1d", "7d", "4w", "1y"]


class MealDailySummary(BaseModel):
    """Um ponto do historico -- um dia (periodos 1d/7d/4w) ou um mes (1y,
    ver granularity). has_data=False quando nao houve nenhuma refeicao
    registrada nesse dia/mes -- diferente de ter registrado e somar 0."""
    date: date
    has_data: bool
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None


class MealsSummaryOut(BaseModel):
    period: MealsSummaryPeriod
    granularity: Literal["day", "month"]
    offset: int
    start_date: date
    end_date: date
    daily: list[MealDailySummary]
    avg_calories: float | None = None
    avg_protein: float | None = None
    avg_carbs: float | None = None
    avg_fat: float | None = None
