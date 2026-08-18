import uuid
from datetime import datetime

from pydantic import BaseModel


class WorkoutGenerateRequest(BaseModel):
    goal: str
    level: str
    days_per_week: int
    equipment: str
    notes: str | None = None


class WorkoutExerciseOut(BaseModel):
    name: str
    sets: int
    reps: str
    rest_seconds: int
    notes: str


class WorkoutDayOut(BaseModel):
    day: str
    focus: str
    exercises: list[WorkoutExerciseOut]
    estimated_duration_minutes: int | None = None
    estimated_calories: int | None = None


class WorkoutPlanGenerated(BaseModel):
    """Resultado da geracao de IA — nao e persistido; o usuario confirma
    (ou ajusta) o plano antes de salvar de verdade via POST /workout-plans."""
    summary: str
    days: list[WorkoutDayOut]


class WorkoutPlanCreate(BaseModel):
    plan_data: WorkoutPlanGenerated
    source: str = "ai"


class WorkoutPlanOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source: str
    trainer_id: uuid.UUID | None = None
    status: str
    plan_data: dict | None = None
    expires_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkoutSetLog(BaseModel):
    """Uma serie de fato executada (peso levantado + repeticoes feitas)."""
    weight_kg: float | None = None
    reps: int | None = None
    completed: bool = False


class WorkoutExerciseLog(BaseModel):
    """
    Nome/planned_* sao um snapshot do que estava no plano no momento do
    registro (plan_data pode mudar depois — ex. usuario gera um plano novo
    — entao a sessao guarda o que foi de fato proposto naquele dia, nao uma
    referencia que pode ficar desatualizada).
    """
    name: str
    planned_sets: int
    planned_reps: str
    sets: list[WorkoutSetLog]


class WorkoutSessionCreate(BaseModel):
    """
    plan_id vem da URL (POST /workout-plans/{plan_id}/sessions), nao do
    corpo. day/focus sao snapshot de qual dia do plano foi executado —
    WorkoutSession nao tem coluna propria pra isso (nao precisou de
    migration, ver workout_sessions.exercises abaixo).
    """
    day: str
    focus: str
    exercises: list[WorkoutExerciseLog]
    duration_minutes: int | None = None
    calories_burned: float | None = None


class WorkoutSessionOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    exercises: dict | None = None
    calories_burned: float | None = None
    duration_minutes: int | None = None
    completed_at: datetime

    class Config:
        from_attributes = True
