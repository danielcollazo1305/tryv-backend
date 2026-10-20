import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ActivityKind = Literal["run", "workout", "manual"]


class ActivityHistoryItem(BaseModel):
    """Item leve do historico (GET /users/me/activities). NUNCA traz a rota/coordenadas (route_points) nem notas."""

    id: uuid.UUID
    kind: ActivityKind  # run = Run (corrida/pedalada/caminhada com GPS), workout = WorkoutSession, manual = ManualActivity
    # 'run' | 'bike' | 'swim' | 'fight' | 'walk' | 'hiit' | 'other' (runs e manuais) ou 'workout' (treinos).
    activity_type: str
    title: str  # rotulo em portugues (ex.: "Corrida", "Treino")
    fight_style: str | None = None  # so atividade manual de luta
    occurred_at: datetime  # inicio da corrida / fim do treino / hora da atividade manual (UTC, como no resto da API)
    duration_seconds: int | None = None
    distance_meters: float | None = None
    calories_burned: float | None = None


class ActivityHistoryPage(BaseModel):
    items: list[ActivityHistoryItem]
    # Cursor opaco da proxima pagina; null = acabaram os itens. Nao montar nem interpretar.
    next_cursor: str | None = None
