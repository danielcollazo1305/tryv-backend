import uuid
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Index, text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class PointsEvent(Base):
    """Ledger de pontos/XP -- um numero so, gerado por atividade real
    (treino concluido, meta de proteina/caloria batida, corrida registrada),
    que alimenta nivel pessoal, ranking individual, ranking de squad e
    dominio de territorio, todos a partir da mesma fonte.

    `source_id`/`source_date` nao tem FK real -- `source_type` aponta pra
    tabelas diferentes (associacao polimorfica), Postgres nao valida FK
    unica pra isso. Os 2 indices unicos parciais abaixo evitam pontuacao
    duplicada (a mesma corrida ou o mesmo dia gerando XP 2x)."""
    __tablename__ = "points_events"
    __table_args__ = (
        Index(
            "uq_points_event_user_source_id",
            "user_id", "source_type", "source_id",
            unique=True,
            postgresql_where=text("source_id IS NOT NULL"),
        ),
        Index(
            "uq_points_event_user_source_date",
            "user_id", "source_type", "source_date",
            unique=True,
            postgresql_where=text("source_date IS NOT NULL"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    amount = Column(Integer, nullable=False)
    # 'workout_session' | 'run' | 'manual_activity' | 'protein_goal' |
    # 'calorie_goal' (lista cresce nas proximas fases, sem enum rigido no
    # banco -- mesmo padrao de goal_type/activity_type ja usado no projeto).
    source_type = Column(String, nullable=False)
    source_id = Column(UUID(as_uuid=True), nullable=True)
    source_date = Column(Date, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
