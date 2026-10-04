import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class AvatarGeneration(Base):
    """Uma geracao de avatar por IA que a OpenAI respondeu com sucesso (o custo
    ja foi incorrido, mesmo se o upload pro S3 falhar depois). Serve so pra
    limitar geracoes por usuario numa janela deslizante (settings.avatar_generation_limit
    geracoes a cada settings.avatar_limit_window_days dias, ver routers/users.py).
    Falha da OpenAI NAO gera registro."""
    __tablename__ = "avatar_generations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
