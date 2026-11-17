import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class AvatarAttempt(Base):
    """Uma TENTATIVA de enviar foto para gerar avatar, com ou sem sucesso (a cota de geracoes, AvatarGeneration, so conta as que a OpenAI
    respondeu). Serve ao teto diario de tentativas (settings.avatar_daily_attempt_limit por 24 h, ver routers/users.py): falha que nao
    consome a cota (foto reprovada na moderacao, recusa da OpenAI) nao pode virar gasto ilimitado com IA."""
    __tablename__ = "avatar_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
