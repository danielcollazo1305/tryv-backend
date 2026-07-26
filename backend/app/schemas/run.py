import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.activity_types import validate_activity_type


class RoutePoint(BaseModel):
    lat: float
    lng: float
    timestamp: datetime


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


class RunSummaryOut(BaseModel):
    start_date: datetime
    end_date: datetime
    total_runs: int
    total_distance_meters: float
    total_duration_seconds: int
    avg_pace_seconds_per_km: float | None = None
