import uuid

from sqlalchemy import Column, Float, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Run(Base):
    __tablename__ = "runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    route_points = Column(JSON, nullable=False)  # lista de {lat, lng, timestamp}

    distance_meters = Column(Float, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    avg_pace_seconds_per_km = Column(Float, nullable=True)  # None se distancia for 0
    calories_burned = Column(Float, nullable=True)  # None se nao houver peso disponivel

    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=False)
