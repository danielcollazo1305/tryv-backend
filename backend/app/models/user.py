import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    weight = Column(Float, nullable=True)  # kg
    height = Column(Float, nullable=True)  # cm
    goal = Column(String, nullable=True)  # 'emagrecimento' | 'hipertrofia' | 'resistencia' etc.
    daily_calorie_goal = Column(Float, nullable=True)  # meta de kcal/dia, definida manualmente pelo usuario

    subscription_status = Column(String, default="inactive")  # 'active' | 'inactive' | 'trial'
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    stripe_customer_id = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
