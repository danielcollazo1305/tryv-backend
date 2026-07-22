import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, Float, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class WorkoutPlan(Base):
    __tablename__ = "workout_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    source = Column(String, nullable=False)  # 'ai' | 'trainer'
    trainer_id = Column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True)

    status = Column(String, default="active")  # 'active' | 'archived'
    plan_data = Column(JSON, nullable=True)  # estrutura semanal de exercícios

    created_at = Column(DateTime, default=datetime.utcnow)


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("workout_plans.id"), nullable=False)

    exercises = Column(JSON, nullable=True)  # exercícios realizados na sessão
    calories_burned = Column(Float, nullable=True)
    duration_minutes = Column(Integer, nullable=True)

    completed_at = Column(DateTime, default=datetime.utcnow)
