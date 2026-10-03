import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class SavedMeal(Base):
    """Refeicao favorita: um molde (mesmos campos de Meal, sem logged_at) que o
    usuario reaproveita com 1 toque -- POST /saved-meals/{id}/log cria uma Meal
    de verdade a partir dele. Nao tem relacao (FK) com Meal: apagar o favorito
    nao mexe nas refeicoes ja registradas com ele."""
    __tablename__ = "saved_meals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    description = Column(String, nullable=True)
    calories = Column(Float, nullable=False)
    protein = Column(Float, nullable=True)
    carbs = Column(Float, nullable=True)
    fat = Column(Float, nullable=True)
    photo_url = Column(String, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
