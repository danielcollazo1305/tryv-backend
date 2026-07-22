import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    type = Column(String, nullable=False)  # 'base' | 'trainer_addon'
    trainer_id = Column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True)

    stripe_subscription_id = Column(String, nullable=True)
    status = Column(String, default="active")  # 'active' | 'canceled' | 'past_due'

    created_at = Column(DateTime, default=datetime.utcnow)
