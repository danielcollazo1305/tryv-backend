import uuid

from sqlalchemy import Column, Float, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Run(Base):
    __tablename__ = "runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Validado em app/core/activity_types.py — string livre, nao enum do banco.
    activity_type = Column(String, nullable=False, default="run")

    route_points = Column(JSON, nullable=False)  # lista de {lat, lng, timestamp}

    distance_meters = Column(Float, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    avg_pace_seconds_per_km = Column(Float, nullable=True)  # None se distancia for 0
    calories_burned = Column(Float, nullable=True)  # None se nao houver peso disponivel

    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=False)

    # Origem externa, quando a atividade veio de uma importacao do hub de saude
    # do celular: external_source = 'apple_health' | 'health_connect',
    # external_id = uuid do HKWorkout (iOS) / metadata.id do ExerciseSession
    # (Android). Ficam NULL em tudo que foi gravado dentro do proprio app e em
    # tudo que ja existia antes destas colunas.
    #
    # Existem pra dar IDEMPOTENCIA de verdade na importacao: a deteccao de
    # duplicata por horario (+-5min, no cliente) nao protege contra dois
    # gatilhos concorrentes (importacao automatica + botao manual, ou dois
    # disparos automaticos seguidos) — os dois leem a lista, nenhum ve o treino
    # ainda, os dois criam. O indice unico PARCIAL criado na migration
    # (user_id, external_source, external_id) WHERE external_id IS NOT NULL
    # fecha essa janela no banco; o parcial e o que mantem os registros
    # antigos/manuais (com NULL) fora da restricao.
    external_source = Column(String, nullable=True)
    external_id = Column(String, nullable=True)

    # Item de equipamento marcado nesta corrida (tenis/bike/faixa cardiaca --
    # ver ALLOWED_CATEGORIES_BY_ACTIVITY_MODEL em app/core/equipment_categories.py),
    # opcional. Gera um PointsEvent bonus separado quando preenchido, ver
    # routers/runs.py.
    equipment_id = Column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True)
