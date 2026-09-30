import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Equipment(Base):
    """
    Item de equipamento cadastrado pelo usuario (ex: "Tenis Pegasus 40"),
    marcado individualmente em cada atividade (Run/ManualActivity/
    WorkoutSession, ver equipment_id nesses 3 models) -- mesmo padrao
    Strava, varias instancias por categoria (ex: 2 tenis diferentes).
    category e validada contra EQUIPMENT_CATEGORIES (ver
    app/core/equipment_categories.py), mas fica como String comum aqui
    (nao enum do banco) -- mesmo padrao ja usado em activity_type.
    """
    __tablename__ = "equipment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    category = Column(String, nullable=False)
    name = Column(String, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
