import uuid

from sqlalchemy import Column, Date, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class CreatineLog(Base):
    """Marca "tomei creatina hoje" -- no maximo 1 por usuario por dia (so a
    data, sem horario). A unique constraint e o que torna o POST idempotente
    mesmo com dois toques simultaneos."""
    __tablename__ = "creatine_logs"
    __table_args__ = (UniqueConstraint("user_id", "logged_at", name="uq_creatine_log_user_date"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    logged_at = Column(Date, nullable=False)
