import uuid
from datetime import date, datetime

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


class DailyHeartRatePoint(BaseModel):
    date: date
    avg_bpm: float
    min_bpm: int
    max_bpm: int


class RestingHeartRateEstimate(BaseModel):
    """
    Aproximacao, nao uma leitura real de FC de repouso (o HealthKit tem um
    tipo especifico pra isso, RestingHeartRate, que o app nao le hoje).
    is_estimated fica sempre True de proposito — nao existe um caminho pra
    isso virar uma leitura real ainda, entao nao ha por que o campo variar.
    """
    bpm: float | None = None
    is_estimated: bool = True
    note: str = "Estimativa baseada no menor bpm registrado por dia — nao e uma leitura de FC de repouso real."


class HeartRateReportOut(BaseModel):
    period_days: int
    daily: list[DailyHeartRatePoint] = []
    avg_bpm: float | None = None
    max_bpm: int | None = None
    resting_estimate: RestingHeartRateEstimate
