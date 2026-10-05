import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.activity_types import validate_activity_type, validate_fight_style


class ManualActivityCreate(BaseModel):
    activity_type: str
    duration_minutes: int = Field(..., gt=0)
    calories_burned: float | None = None
    notes: str | None = None
    performed_at: datetime
    # Ver o mesmo par em app/schemas/run.py — identidade do treino na fonte
    # externa, torna o POST idempotente quando preenchida.
    external_source: str | None = None
    external_id: str | None = None
    # LEGADO: atividade manual nao aceita mais equipamento; o campo continua no schema so pra um app antigo
    # nao tomar 422 -- o valor e ignorado (services/equipment.py:ignore_equipment_for_activity).
    equipment_id: uuid.UUID | None = None
    # Estilo de luta (opcional; ausente ou null e sempre aceito, entao app antigo e a importacao automatica
    # continuam funcionando). Valor invalido -> 422; so vale quando activity_type == 'fight' (a checagem de
    # tipo e feita no router: 400 "fight_style so vale para luta").
    fight_style: str | None = None

    @field_validator("activity_type")
    @classmethod
    def _check_activity_type(cls, value: str) -> str:
        return validate_activity_type(value)

    @field_validator("fight_style")
    @classmethod
    def _check_fight_style(cls, value: str | None) -> str | None:
        return None if value is None else validate_fight_style(value)


class ManualActivityOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: str
    duration_minutes: int
    calories_burned: float | None = None
    notes: str | None = None
    performed_at: datetime
    external_source: str | None = None
    external_id: str | None = None
    fight_style: str | None = None

    class Config:
        from_attributes = True
