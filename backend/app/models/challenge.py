import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY

from app.core.database import Base


class Challenge(Base):
    __tablename__ = "challenges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nullable a partir da reformulacao "App vs Personal": desafios oficiais
    # (is_official=True) nao tem um profissional criador de verdade — ver
    # is_official abaixo. Desafios de profissional (o que ja existia)
    # continuam sempre com trainer_id preenchido.
    trainer_id = Column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)

    participant_ids = Column(ARRAY(UUID(as_uuid=True)), default=list)

    # Decisao de schema (reformulacao da aba Desafios): desafio "App" (criado
    # oficialmente pelo Tryv, aba "App") vs desafio "Personal" (criado por um
    # profissional do marketplace, aba "Personal"). Optou-se por um campo
    # boolean simples em vez de uma conta/trainer especial "Tryv Oficial" —
    # um Trainer fake exigiria tambem um User fake, license_number e price
    # fakes (campos nao-nulos hoje), misturando o conceito de "profissional
    # verificado" com "conteudo oficial do app", que sao coisas diferentes.
    is_official = Column(Boolean, nullable=False, default=False)

    # So preenchido em desafios oficiais (is_official=True) — 'musculacao_corrida'
    # ou 'alimentacao' (ver ChallengeCategory nos schemas). Desafios de
    # profissional nao sao categorizados nessas 2 categorias (a aba
    # "Personal" lista todos, sem filtro de categoria).
    category = Column(String, nullable=True)

    # Progresso mensuravel por tipo de meta — 'manual' preserva o
    # comportamento de sempre (check-in binario via ChallengeCheckin,
    # default seguro pros 2 desafios oficiais ja existentes em producao,
    # que continuam manuais ate serem reclassificados manualmente se fizer
    # sentido). Os 3 automaticos ('nutrition'/'distance'/'training_frequency')
    # nunca gravam ChallengeCheckin — o progresso e calculado sob demanda a
    # partir de Meal/Run/WorkoutSession (ver _day_goal_met e
    # _compute_goal_progress_days em routers/challenges.py), no mesmo
    # espirito de _compute_training_frequency/_compute_weekly_activity em
    # routers/dashboard.py (nunca persistido, sempre recalculado).
    goal_type = Column(String, nullable=False, default="manual")
    # 'nutrition': gramas de proteina/dia (ex: 160). 'distance': km minimos
    # por corrida (ex: 5). Nulo pra 'training_frequency' e 'manual'.
    target_value = Column(Float, nullable=True)
    # ex: 'protein_g_per_day' | 'distance_km_per_run'. Nulo pra
    # 'training_frequency' e 'manual' (mesma razao de target_value).
    target_unit = Column(String, nullable=True)
    # Usado por 'distance' (ex: 4 corridas qualificadas/semana) e
    # 'training_frequency' (ex: 4 treinos/semana). Nulo pra 'nutrition'
    # (meta e diaria, nao semanal) e 'manual'.
    target_frequency_per_week = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class ChallengeCheckin(Base):
    """
    Registro de "fiz hoje" de um participante num desafio — nao existia
    nenhuma estrutura de participacao por dia antes desta tarefa (so o
    array agregado participant_ids, que so diz SE a pessoa participa, nao
    o que ela fez em cada dia). E a partir daqui que o heatmap de
    consistencia e o "progresso da comunidade" (ChallengeOut.community_progress_percent)
    passam a ser calculados de dados reais, em vez de um numero solto.
    """

    __tablename__ = "challenge_checkins"
    __table_args__ = (UniqueConstraint("user_id", "challenge_id", "date", name="uq_challenge_checkin_user_day"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False)

    date = Column(Date, nullable=False)
    photo_url = Column(String, nullable=True)
    shared_publicly = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
