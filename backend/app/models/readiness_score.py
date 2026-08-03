import uuid
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class ReadinessScore(Base):
    """Score de prontidao para treino (0-100) por usuario por dia — no
    maximo um por data (uq abaixo); recalculado/sobrescrito a cada chamada
    de GET /readiness/today no mesmo dia, nao apenas gerado uma vez."""
    __tablename__ = "readiness_scores"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_readiness_score_user_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    date = Column(Date, nullable=False)
    sleep_score = Column(Float, nullable=True)
    load_score = Column(Float, nullable=True)
    hr_score = Column(Float, nullable=True)
    final_score = Column(Float, nullable=False)
    recommendation_text = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
