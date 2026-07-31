import uuid
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class WeightLog(Base):
    """Um registro de peso por usuario por dia — no maximo um por data (uq abaixo)."""
    __tablename__ = "weight_logs"
    __table_args__ = (
        UniqueConstraint("user_id", "logged_at", name="uq_weight_log_user_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    weight_kg = Column(Numeric(5, 2), nullable=False)
    logged_at = Column(Date, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
