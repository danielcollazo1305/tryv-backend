import uuid
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class DailyInsight(Base):
    """Insight proativo gerado por IA uma vez por dia — no maximo um por
    usuario por data (uq abaixo); POST /insights/generate sobrescreve o do
    dia em vez de duplicar."""
    __tablename__ = "daily_insights"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_daily_insight_user_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    date = Column(Date, nullable=False)
    insight_text = Column(Text, nullable=False)
    category = Column(String(20), nullable=False)  # 'nutrition' | 'training' | 'recovery' | 'general'
    source_data_snapshot = Column(JSONB, nullable=True)  # dados usados na geracao, so para debug futuro

    created_at = Column(DateTime, default=datetime.utcnow)
