import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
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
