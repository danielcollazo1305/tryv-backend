import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.smartwatch import SmartwatchSource


class HeartRateSampleItem(BaseModel):
    bpm: int = Field(..., gt=0, lt=300)
    recorded_at: datetime


class HeartRateSyncRequest(BaseModel):
    """Um lote de amostras vem tipicamente de uma unica sincronizacao de
    device, entao a fonte e informada uma vez para o lote inteiro."""
    source: SmartwatchSource
    samples: list[HeartRateSampleItem] = Field(..., min_length=1)


class HeartRateSampleOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source: str
    bpm: int
    recorded_at: datetime

    class Config:
        from_attributes = True
