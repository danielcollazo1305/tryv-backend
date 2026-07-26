import uuid

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class HeartRateSample(Base):
    """Leitura pontual de FC (vinda de smartwatch/wearable), granular o
    suficiente para calcular media/maxima de uma atividade especifica."""
    __tablename__ = "heart_rate_samples"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    source = Column(String, nullable=False)  # mesma lista de SmartwatchData: 'healthkit' | 'googlefit' | 'fitbit' | 'garmin'
    bpm = Column(Integer, nullable=False)
    recorded_at = Column(DateTime, nullable=False)
