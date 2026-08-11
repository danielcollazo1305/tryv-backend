import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_DIET_PLAN_STATUSES = ["active", "archived"]


class DietPlanItem(BaseModel):
    food: str
    quantity: str
    calories: float | None = Field(None, ge=0)
    protein: float | None = Field(None, ge=0)
    carbs: float | None = Field(None, ge=0)
    fat: float | None = Field(None, ge=0)


class DietPlanMeal(BaseModel):
    name: str  # ex: "Cafe da manha"
    time: str | None = None  # ex: "07:30", texto livre
    items: list[DietPlanItem] = []


class DietPlanData(BaseModel):
    meals: list[DietPlanMeal] = []


class DietPlanCreate(BaseModel):
    user_id: uuid.UUID  # aluno para quem o plano e criado
    plan_data: DietPlanData
    daily_calorie_target: float | None = Field(None, ge=0)
    daily_protein_target: float | None = Field(None, ge=0)
    daily_carbs_target: float | None = Field(None, ge=0)
    daily_fat_target: float | None = Field(None, ge=0)
    notes: str | None = None


class DietPlanUpdate(BaseModel):
    plan_data: DietPlanData | None = None
    daily_calorie_target: float | None = Field(None, ge=0)
    daily_protein_target: float | None = Field(None, ge=0)
    daily_carbs_target: float | None = Field(None, ge=0)
    daily_fat_target: float | None = Field(None, ge=0)
    notes: str | None = None
    status: str | None = None  # 'active' | 'archived' — usado para arquivar um plano antigo

    @field_validator("status")
    @classmethod
    def _check_status(cls, value: str | None) -> str | None:
        if value is not None and value not in _DIET_PLAN_STATUSES:
            raise ValueError(f"status deve ser um de: {', '.join(_DIET_PLAN_STATUSES)}")
        return value


class DietPlanOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    trainer_id: uuid.UUID
    status: str
    daily_calorie_target: float | None = None
    daily_protein_target: float | None = None
    daily_carbs_target: float | None = None
    daily_fat_target: float | None = None
    plan_data: dict | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
