import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Equipment(Base):
    """
    Item de equipamento cadastrado pelo usuario (ex: "Tenis Pegasus"), mesmo padrao Strava ("gear"),
    varias instancias por categoria (ex: 2 tenis diferentes). category e validada contra
    EQUIPMENT_CATEGORIES (ver app/core/equipment_categories.py), mas fica como String comum aqui
    (nao enum do banco) -- mesmo padrao ja usado em activity_type.

    Vinculo com atividade: SO Run (tenis em corrida/caminhada, bike em pedalada) -- ver
    app/services/equipment.py. Relogio e fita cardiaca sao so cadastro. As colunas equipment_id de
    ManualActivity e WorkoutSession continuam existindo (historico/legado) mas nada novo grava nelas.

    - tenis: brand/model/shoe_model_id (catalogo, ou "Outro" = texto livre), lifespan_km (vida util),
      initial_distance_km (quilometragem antes do app).
    - bike: maintenance_interval_km e last_maintenance_at (inicio da contagem desde a ultima revisao);
      initial_distance_km conta ate a primeira revisao.
    - is_default: equipamento padrao da categoria (so tenis e bike), aplicado sozinho nas atividades
      novas sem equipment_id (inclusive importadas). Indice unico parcial: no maximo 1 padrao ATIVO por
      (usuario, categoria).
    - retired_at: aposentado = escondido das listas padrao, historico mantido (nao some nem vira padrao).
    Datas em UTC naive, como o resto do projeto.
    """
    __tablename__ = "equipment"
    __table_args__ = (
        Index(
            "uq_equipment_user_category_default",
            "user_id", "category",
            unique=True,
            postgresql_where=text("is_default AND retired_at IS NULL"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    category = Column(String, nullable=False)
    name = Column(String, nullable=False)

    brand = Column(String, nullable=True)
    model = Column(String, nullable=True)
    shoe_model_id = Column(Integer, ForeignKey("shoe_models.id", ondelete="SET NULL"), nullable=True)

    initial_distance_km = Column(Float, nullable=False, default=0.0, server_default=text("0"))
    lifespan_km = Column(Float, nullable=True)
    maintenance_interval_km = Column(Float, nullable=True)
    last_maintenance_at = Column(DateTime, nullable=True)

    retired_at = Column(DateTime, nullable=True)
    is_default = Column(Boolean, nullable=False, default=False, server_default=text("false"))

    created_at = Column(DateTime, default=datetime.utcnow)
