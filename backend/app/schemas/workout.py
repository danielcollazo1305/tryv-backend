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
    # Video de execucao — nunca preenchido pela IA (o prompt de geracao nao
    # tem de onde tirar isso), so por planos source='trainer' (o
    # profissional sobe o video, ver POST /trainers/students/{id}/workout-plans).
    # Mesmo endpoint generico de upload de midia (/media/upload) das fotos
    # de refeicao/desafio, so que aceitando video pra pasta "workouts".
    video_url: str | None = None


class WorkoutDayOut(BaseModel):
    day: str
    # 0=domingo...6=sabado (indice nativo do JS, nao ISO — ver comentario em
    # workout_generator.py._DAY_SCHEMA). Nullable pra nao quebrar planos
    # gerados antes desse campo existir (plan_data e um JSON solto, entao
    # planos antigos simplesmente nao tem essa chave — sem migration
    # necessaria). Usado pelo app pra saber com confianca qual dia do plano
    # e "hoje" (ver getTodayOrNextWorkoutDay no mobile).
    day_of_week: int | None = None
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
    Em POST /workout-plans/{plan_id}/sessions, plan_id vem da URL (nao do
    corpo) — o campo `plan_id` aqui fica None/ignorado nesse caso. Em POST
    /workout-sessions (sessao livre, sem plano), plan_id vem do corpo,
    podendo ser None de verdade. day/focus sao snapshot de qual dia do
    plano foi executado — obrigatorios pra sessao de plano, None numa
    sessao livre (nao ha "dia"/"foco" de um plano pra registrar).
    WorkoutSession nao tem coluna propria pra day/focus (nao precisou de
    migration, ver workout_sessions.exercises abaixo).
    """
    plan_id: uuid.UUID | None = None
    day: str | None = None
    focus: str | None = None
    exercises: list[WorkoutExerciseLog]
    duration_minutes: int | None = None
    calories_burned: float | None = None


class WorkoutLastExerciseOut(BaseModel):
    """
    Resposta de GET /workout-sessions/last-exercise — busca por
    exercise_name (string, snapshot salvo em WorkoutSession.exercises), nao
    por plano/dia/indice, entao cobre sessao de plano E sessao livre com a
    mesma consulta (ver routers/workout_sessions.py.get_last_exercise).
    """
    exercise_name: str
    completed_at: datetime
    sets: list[WorkoutSetLog]


class WorkoutSessionOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID | None = None
    user_id: uuid.UUID
    exercises: dict | None = None
    calories_burned: float | None = None
    duration_minutes: int | None = None
    completed_at: datetime

    class Config:
        from_attributes = True
