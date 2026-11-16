import uuid

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class HeartRateSample(Base):
    """Leitura pontual de FC (vinda de smartwatch/wearable), granular o
    suficiente para calcular media/maxima de uma atividade especifica."""
    __tablename__ = "heart_rate_samples"
    __table_args__ = (
        # Deduplicacao (migration b8e2d4f6a1c3): a mesma leitura (usuario, fonte, instante) so existe uma vez; POST /heart-rate/sync usa
        # ON CONFLICT DO NOTHING neste unique, entao reenviar um lote (ou a amostra da borda do lote anterior) e inofensivo.
        UniqueConstraint("user_id", "source", "recorded_at", name="uq_heart_rate_user_source_recorded"),
        # Consultas por usuario e janela de tempo (GET /heart-rate, /report, readiness, insights).
        Index("ix_heart_rate_samples_user_recorded_at", "user_id", "recorded_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    source = Column(String, nullable=False)  # mesma lista de SmartwatchData: 'healthkit' | 'googlefit' | 'fitbit' | 'garmin'
    bpm = Column(Integer, nullable=False)
    recorded_at = Column(DateTime, nullable=False)
