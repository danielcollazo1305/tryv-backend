import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class SmartwatchData(Base):
    __tablename__ = "smartwatch_data"
    __table_args__ = (
        UniqueConstraint("user_id", "source", "recorded_date", name="uq_smartwatch_user_source_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    source = Column(String, nullable=False)  # 'healthkit' | 'googlefit' | 'fitbit' | 'garmin'

    steps = Column(Integer, nullable=True)
    heart_rate_avg = Column(Float, nullable=True)
    heart_rate_resting = Column(Float, nullable=True)
    sleep_minutes = Column(Integer, nullable=True)
    calories_active = Column(Float, nullable=True)

    recorded_date = Column(Date, nullable=False)  # dia a que os dados se referem
    synced_at = Column(DateTime, default=datetime.utcnow)  # quando chegou no servidor
