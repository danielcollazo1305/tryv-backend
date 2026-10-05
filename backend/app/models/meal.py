import uuid

from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.core import timezone as tz


class Meal(Base):
    __tablename__ = "meals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    photo_url = Column(String, nullable=True)
    description = Column(String, nullable=True)
    calories = Column(Float, nullable=True)
    protein = Column(Float, nullable=True)
    carbs = Column(Float, nullable=True)
    fat = Column(Float, nullable=True)

    # Instante em UTC naive. tz.utc_now (core/timezone.py) e o ponto unico de relogio; a chamada
    # e TARDIA (lambda) de proposito: assim os testes de "dia local" congelam o horario da
    # refeicao patchando so app.core.timezone.utc_now.
    logged_at = Column(DateTime, default=lambda: tz.utc_now())
