import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class WaterLog(Base):
    """Um registro de consumo de agua (varios por dia). O total do dia e a
    soma de amount_ml dos registros com logged_at naquele dia."""
    __tablename__ = "water_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    amount_ml = Column(Integer, nullable=False)
    logged_at = Column(DateTime, nullable=False, default=datetime.utcnow)
