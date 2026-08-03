import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class LiveActivity(Base):
    """
    Estado efemero de uma atividade GPS acontecendo agora, pro professor
    acompanhar ao vivo (Live Activity). Existe so enquanto o treino esta
    rolando — sem relacao com o historico: quando o aluno finaliza, esta
    linha e apagada (ver POST /activities/live/{id}/finish) e a atividade
    de verdade e salva normalmente via POST /runs, como ja acontecia antes.
    """
    __tablename__ = "live_activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Unique: um aluno so pode ter uma atividade ao vivo por vez — iniciar
    # uma nova sempre substitui uma anterior orfa (ver start_live_activity).
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)

    activity_type = Column(String, nullable=False)
    started_at = Column(DateTime, nullable=False)
    last_updated_at = Column(DateTime, nullable=False)

    last_lat = Column(Float, nullable=True)
    last_lng = Column(Float, nullable=True)
    distance_meters = Column(Float, nullable=False, default=0.0)
    elapsed_seconds = Column(Integer, nullable=False, default=0)
    pace_seconds_per_km = Column(Float, nullable=True)
    heart_rate_bpm = Column(Integer, nullable=True)
