import uuid

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.core import timezone as tz


class Meal(Base):
    __tablename__ = "meals"
    # Consultas por usuario e dia (GET /meals/days, GET /meals/?date=, GET /meals/summary).
    __table_args__ = (Index("ix_meals_user_logged_at", "user_id", "logged_at"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    photo_url = Column(String, nullable=True)
    # Miniatura 320x240 WebP da foto (meals/{uuid}_thumb.webp). Nullable: refeicoes antigas nao tem, e a geracao
    # da miniatura pode falhar sem falhar o upload.
    photo_thumb_url = Column(String, nullable=True)
    description = Column(String, nullable=True)
    calories = Column(Float, nullable=True)
    protein = Column(Float, nullable=True)
    carbs = Column(Float, nullable=True)
    fat = Column(Float, nullable=True)

    # Instante em UTC naive. tz.utc_now (core/timezone.py) e o ponto unico de relogio; a chamada
    # e TARDIA (lambda) de proposito: assim os testes de "dia local" congelam o horario da
    # refeicao patchando so app.core.timezone.utc_now.
    logged_at = Column(DateTime, default=lambda: tz.utc_now())
