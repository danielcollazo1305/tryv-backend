import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.storage import is_own_meal_thumb_url


class MealAnalysisOut(BaseModel):
    """Resultado da analise de IA — nao e persistido; o usuario confirma
    (ou ajusta) os valores antes de registrar a refeicao de verdade."""
    description: str
    calories: float
    protein: float
    carbs: float
    fat: float
    confidence: str


class MealTextAnalysisRequest(BaseModel):
    """Payload de POST /meals/analyze-text — modo manual sem foto, ver
    analyze_meal_text em app/services/meal_analysis.py."""
    description: str = Field(..., min_length=1)
    quantity: str | None = None


class MealCreate(BaseModel):
    photo_url: str | None = None
    # So e gravada se for uma miniatura do NOSSO bucket/regiao sob meals/ (.webp, sem ..); qualquer outra coisa
    # vira null, sem erro 400 (o app nao deve falhar o registro da refeicao por causa da miniatura).
    photo_thumb_url: str | None = None
    description: str | None = None
    calories: float = Field(..., ge=0)
    protein: float | None = Field(None, ge=0)
    carbs: float | None = Field(None, ge=0)
    fat: float | None = Field(None, ge=0)

    @field_validator("photo_thumb_url")
    @classmethod
    def _only_our_meal_thumb(cls, value: str | None) -> str | None:
        return value if is_own_meal_thumb_url(value) else None


class MealOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    photo_url: str | None = None
    photo_thumb_url: str | None = None
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


class MealDayOut(BaseModel):
    """Um dia LOCAL de GET /meals/days: sempre presente, mesmo sem refeicao (total_calories=0, meals_count=0,
    sem foto). photo_url = foto da refeicao MAIS RECENTE do dia que tenha foto; photo_thumb_url = miniatura da
    MESMA refeicao (null se ela nao tiver miniatura, ex: refeicoes antigas)."""
    date: date
    total_calories: float = 0
    meals_count: int = 0
    photo_url: str | None = None
    photo_thumb_url: str | None = None
