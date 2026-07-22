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
    created_at: datetime

    class Config:
        from_attributes = True
