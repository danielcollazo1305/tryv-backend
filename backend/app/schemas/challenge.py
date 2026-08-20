import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, model_validator

ChallengeCategory = Literal["musculacao_corrida", "alimentacao"]

# 'manual': check-in binario de sempre (ChallengeCheckin, "Fiz hoje").
# 'nutrition'/'distance'/'training_frequency': progresso calculado sob
# demanda a partir de Meal/Run/WorkoutSession, nunca gravado — ver
# _day_goal_met/_compute_goal_progress_days em routers/challenges.py.
GoalType = Literal["manual", "nutrition", "distance", "training_frequency"]


class ChallengeCreate(BaseModel):
    title: str
    description: str | None = None
    start_date: datetime
    end_date: datetime
    # So usado por administradores criando desafio oficial ("App") — ver
    # validacao em routers/challenges.py. Profissional criando desafio
    # normal ("Personal") nao envia nenhum dos dois (ficam no default).
    is_official: bool = False
    category: ChallengeCategory | None = None

    goal_type: GoalType = "manual"
    # 'nutrition': gramas de proteina/dia (ex: 160). 'distance': km minimos
    # por corrida (ex: 5). Ver validacao abaixo pra quais goal_type exigem
    # (ou proibem) cada campo.
    target_value: float | None = None
    # ex: 'protein_g_per_day' | 'distance_km_per_run'.
    target_unit: str | None = None
    # 'distance': corridas qualificadas/semana (ex: 4). 'training_frequency':
    # treinos/semana (ex: 4).
    target_frequency_per_week: int | None = None

    @model_validator(mode="after")
    def _validate_goal_fields(self):
        """
        Evita desafio mal configurado — cada goal_type exige exatamente os
        campos que faz sentido calcular, e nada alem disso (um
        target_value solto num desafio 'manual', por exemplo, nunca seria
        usado pra nada e so confundiria quem for ler o registro depois).
        """
        if self.goal_type == "nutrition":
            if self.target_value is None or self.target_unit is None:
                raise ValueError("goal_type 'nutrition' exige target_value e target_unit")
            if self.target_frequency_per_week is not None:
                raise ValueError("goal_type 'nutrition' nao usa target_frequency_per_week (meta e diaria)")
        elif self.goal_type == "distance":
            if self.target_value is None or self.target_unit is None or self.target_frequency_per_week is None:
                raise ValueError("goal_type 'distance' exige target_value, target_unit e target_frequency_per_week")
        elif self.goal_type == "training_frequency":
            if self.target_frequency_per_week is None:
                raise ValueError("goal_type 'training_frequency' exige target_frequency_per_week")
            if self.target_value is not None or self.target_unit is not None:
                raise ValueError("goal_type 'training_frequency' nao usa target_value/target_unit")
        else:  # 'manual'
            if self.target_value is not None or self.target_unit is not None or self.target_frequency_per_week is not None:
                raise ValueError("goal_type 'manual' nao usa nenhum campo de meta")
        return self


class ChallengeOut(BaseModel):
    id: uuid.UUID
    trainer_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    start_date: datetime
    end_date: datetime
    participants_count: int
    is_official: bool
    category: str | None = None
    goal_type: str
    target_value: float | None = None
    target_unit: str | None = None
    target_frequency_per_week: int | None = None
    # Calculado (nao armazenado, mesmo padrao de participants_count): %
    # dos participantes que ja bateram a meta HOJE — check-in real
    # (goal_type='manual') ou calculo automatico a partir de
    # Meal/Run/WorkoutSession (os outros 3 goal_type).
    community_progress_percent: int
    created_at: datetime


class ChallengeProgressDayOut(BaseModel):
    """
    Equivalente a ChallengeCheckinOut pros 3 goal_type automaticos — mesma
    forma que HeatmapDay/TrainingDay ja usam no resto do app (date +
    estado do dia), usado por GET /challenges/{id}/progress/me pra
    alimentar o heatmap de consistencia sem depender de ChallengeCheckin
    (que so existe pra goal_type='manual').
    """
    date: date
    achieved: bool


class ChallengeCheckinCreate(BaseModel):
    photo_url: str | None = None
    shared_publicly: bool = False


class ChallengeCheckinOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    challenge_id: uuid.UUID
    date: date
    photo_url: str | None = None
    shared_publicly: bool
    created_at: datetime

    class Config:
        from_attributes = True
