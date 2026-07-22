import uuid
from datetime import datetime

from pydantic import BaseModel


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
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None


class MealOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    photo_url: str | None = None
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    logged_at: datetime

    class Config:
        from_attributes = True
