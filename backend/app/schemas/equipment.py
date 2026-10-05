import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.equipment_categories import validate_equipment_category


class EquipmentCreate(BaseModel):
    category: str
    name: str = Field(..., min_length=1, max_length=60)
    # Tenis: marca/modelo (texto livre = "Outro", ou preenchidos a partir do catalogo via shoe_model_id).
    brand: str | None = Field(None, max_length=60)
    model: str | None = Field(None, max_length=60)
    shoe_model_id: int | None = None
    # Tenis e bike: quilometragem que o item ja tinha antes de entrar no app.
    initial_distance_km: float | None = Field(None, ge=0)
    # Tenis: vida util (km). Bike: intervalo de revisao (km). Sem valor -> padrao do catalogo/settings.
    lifespan_km: float | None = Field(None, gt=0)
    maintenance_interval_km: float | None = Field(None, gt=0)
    is_default: bool = False

    @field_validator("category")
    @classmethod
    def _check_category(cls, value: str) -> str:
        return validate_equipment_category(value)


class EquipmentUpdate(BaseModel):
    """PATCH parcial: so os campos ENVIADOS (model_fields_set) sao aplicados."""
    name: str | None = Field(None, min_length=1, max_length=60)
    brand: str | None = Field(None, max_length=60)
    model: str | None = Field(None, max_length=60)
    lifespan_km: float | None = Field(None, gt=0)
    maintenance_interval_km: float | None = Field(None, gt=0)
    initial_distance_km: float | None = Field(None, ge=0)
    is_default: bool | None = None
    # true aposenta (seta retired_at, limpa is_default); false reativa.
    retired: bool | None = None


class EquipmentOut(BaseModel):
    id: uuid.UUID
    category: str
    name: str
    created_at: datetime

    brand: str | None = None
    model: str | None = None
    shoe_model_id: int | None = None
    initial_distance_km: float = 0.0
    lifespan_km: float | None = None
    maintenance_interval_km: float | None = None
    last_maintenance_at: datetime | None = None
    retired_at: datetime | None = None
    is_default: bool = False

    # Calculados (aditivos; ver services/equipment.py). Datas em UTC naive, como o resto da API.
    total_distance_km: float | None = None  # tenis/bike: initial_distance_km + corridas vinculadas
    uses_count: int = 0
    last_used_at: datetime | None = None
    wear_percent: float | None = None  # so tenis, SEM clamp (pode passar de 100)
    km_since_maintenance: float | None = None  # so bike
    maintenance_percent: float | None = None  # so bike, SEM clamp

    class Config:
        from_attributes = True
