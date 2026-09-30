import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.equipment_categories import validate_equipment_category


class EquipmentCreate(BaseModel):
    category: str
    name: str = Field(..., min_length=1, max_length=60)

    @field_validator("category")
    @classmethod
    def _check_category(cls, value: str) -> str:
        return validate_equipment_category(value)


class EquipmentOut(BaseModel):
    id: uuid.UUID
    category: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
