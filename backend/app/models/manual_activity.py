import uuid

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class ManualActivity(Base):
    """
    Registro manual de atividades sem GPS/rastreamento automatico (natacao
    em piscina, luta, etc.) — mesma lista de activity_type de Run, validada
    em app/core/activity_types.py.
    """
    __tablename__ = "manual_activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    activity_type = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    calories_burned = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    performed_at = Column(DateTime, nullable=False)
