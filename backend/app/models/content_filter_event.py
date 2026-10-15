import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class ContentFilterEvent(Base):
    """Uma tentativa de publicar texto BLOQUEADA pelo filtro de conteudo (E3e). Guarda so QUEM, ONDE, QUAL CATEGORIA e
    QUANDO: nunca o texto, nunca o termo, nunca o IP. Serve para o limite de tentativas (services/content_filter_guard.py)
    e para o dono ver numeros e reincidentes.

    user_id e NULL no cadastro (a conta ainda nao existe). Ao excluir a conta os eventos dela sao apagados
    (services/account_deletion.py); o ON DELETE CASCADE e so uma rede de seguranca."""

    __tablename__ = "content_filter_events"
    __table_args__ = (Index("ix_content_filter_events_user_created", "user_id", "created_at"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    # post_caption, comment, name, squad_name, challenge_title, challenge_description, challenge_target_unit, trainer_bio, trainer_certifications
    surface = Column(String(40), nullable=False)
    # insult, hate, threat, sexual, selfharm (core/content_filter.CATEGORIES)
    category = Column(String(20), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
