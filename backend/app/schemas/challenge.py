import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

ChallengeCategory = Literal["musculacao_corrida", "alimentacao"]


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
    # Calculado (nao armazenado, mesmo padrao de participants_count): %
    # dos participantes que ja fizeram check-in HOJE. Antes desta tarefa
    # a tela mostrava um mockup de "Progresso da Comunidade" sem dado real
    # nenhum por tras — agora vem de ChallengeCheckin de verdade.
    community_progress_percent: int
    created_at: datetime


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
