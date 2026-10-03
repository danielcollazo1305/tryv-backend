import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SavedMealCreate(BaseModel):
    """Mesmos campos e regras de MealCreate (schemas/meal.py): calories
    obrigatorio, o resto opcional."""
    description: str | None = None
    calories: float = Field(..., ge=0)
    protein: float | None = Field(None, ge=0)
    carbs: float | None = Field(None, ge=0)
    fat: float | None = Field(None, ge=0)
    photo_url: str | None = None


class SavedMealOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    description: str | None = None
    calories: float
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    photo_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
