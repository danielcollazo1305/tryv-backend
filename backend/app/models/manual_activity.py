import uuid

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class ManualActivity(Base):
    """
    Registro manual de atividades sem GPS/rastreamento automatico (natacao
    em piscina, luta, etc.) — mesma lista de activity_type de Run, validada
    em app/core/activity_types.py.
    """
    __tablename__ = "manual_activities"
    # Idempotencia da importacao do hub de saude (migration d4c1a7f93b02) -- ver comentario abaixo.
    __table_args__ = (
        Index(
            "ix_manual_activities_user_external_unique",
            "user_id", "external_source", "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    activity_type = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    calories_burned = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    performed_at = Column(DateTime, nullable=False)

    # Mesma semantica de Run.external_source/external_id — ver o comentario
    # completo em app/models/run.py. Um treino importado do Health entra aqui
    # (atividade manual) quando nao tem rota de GPS, e em `runs` quando tem;
    # por isso as duas tabelas precisam da mesma protecao contra duplicata.
    external_source = Column(String, nullable=True)
    external_id = Column(String, nullable=True)

    # LEGADO: atividade manual nao aceita mais equipamento (nada novo grava aqui; so vinculos antigos).
    # Antes: luva_faixa/faixa cardiaca, opcional. Gera um PointsEvent bonus separado quando preenchido, ver
    # routers/activities.py.
    equipment_id = Column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True)
