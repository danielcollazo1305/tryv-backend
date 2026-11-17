import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class AiUsage(Base):
    """Uma chamada a IA (Anthropic) feita em nome de um usuario: SO numeros (ver services/ai_usage.py). Nunca guarda o prompt nem a resposta.
    Serve a dois fins: acompanhar custo (tokens por funcionalidade/modelo) e o teto diario por usuario (POST /insights/generate).
    Dado do usuario: e apagada junto com a conta (services/account_deletion.py)."""
    __tablename__ = "ai_usage"
    # Contagem do dia por usuario e funcionalidade (teto diario).
    __table_args__ = (Index("ix_ai_usage_user_feature_created_at", "user_id", "feature", "created_at"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # 'meal_photo' | 'meal_text' | 'workout_plan' | 'daily_insight' | 'activity_insight' (texto livre, nao enum do banco).
    feature = Column(String, nullable=False)
    model = Column(String, nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
