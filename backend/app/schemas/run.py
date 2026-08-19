import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.activity_types import validate_activity_type


class RoutePoint(BaseModel):
    lat: float
    lng: float
    timestamp: datetime
    # Metros acima do nivel do mar — usada pro "Ganho de elev." do card de
    # progresso da Home (ver _elevation_gain_meters em routers/dashboard.py).
    # Ausente em rotas gravadas antes dessa captura existir no app.
    alt: float | None = None


class RunCreate(BaseModel):
    activity_type: str = "run"
    route_points: list[RoutePoint] = Field(..., min_length=1)
    started_at: datetime
    finished_at: datetime
    # Peso no momento da corrida, usado para estimar calorias. Se omitido,
    # cai para o peso salvo no perfil do usuario (pode ficar None em ambos
    # os casos, e nesse caso calories_burned sai None).
    user_weight_kg: float | None = None

    @field_validator("activity_type")
    @classmethod
    def _check_activity_type(cls, value: str) -> str:
        return validate_activity_type(value)

    @model_validator(mode="after")
    def _validate_times(self):
        if self.finished_at <= self.started_at:
            raise ValueError("finished_at deve ser posterior a started_at")
        return self


class RunOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: str
    route_points: list[RoutePoint]
    distance_meters: float
    duration_seconds: int
    avg_pace_seconds_per_km: float | None = None
    calories_burned: float | None = None
    started_at: datetime
    finished_at: datetime

    class Config:
        from_attributes = True


class RunDetailOut(RunOut):
    """Usado so em GET /runs/{id} — FC calculada sob demanda a partir das
    amostras de HeartRateSample dentro da janela started_at..finished_at."""
    heart_rate_avg: float | None = None
    heart_rate_max: int | None = None


class RunCreateOut(RunOut):
    """Usado so em POST /runs — new_prs lista quais recordes pessoais essa
    corrida bateu (vazio pra usuario free, que nao tem o recurso de PRs)."""
    new_prs: list[str] = []


class RunSummaryOut(BaseModel):
    start_date: datetime
    end_date: datetime
    total_runs: int
    total_distance_meters: float
    total_duration_seconds: int
    avg_pace_seconds_per_km: float | None = None


class DistanceRecordOut(BaseModel):
    distance_meters: float
    run_id: uuid.UUID
    achieved_at: datetime


class DurationRecordOut(BaseModel):
    duration_seconds: int
    run_id: uuid.UUID
    achieved_at: datetime


class PaceRecordOut(BaseModel):
    avg_pace_seconds_per_km: float
    distance_meters: float
    run_id: uuid.UUID
    achieved_at: datetime


class ActivityTypeRecordsOut(BaseModel):
    longest_distance: DistanceRecordOut | None = None
    longest_duration: DurationRecordOut | None = None
    # chave: '1km' | '5km' | '10km' — so aparece se houver atividade dentro
    # da tolerancia de distancia pra essa referencia
    best_pace_by_reference: dict[str, PaceRecordOut] = {}


class PersonalRecordsOut(BaseModel):
    # chave: activity_type ('run', 'bike', etc.) — so aparece quem tem pelo
    # menos 1 atividade registrada
    records_by_activity_type: dict[str, ActivityTypeRecordsOut] = {}
