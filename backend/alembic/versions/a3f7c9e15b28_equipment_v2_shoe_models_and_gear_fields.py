"""equipment v2: shoe_models, gear fields, default/retired, partial indexes

Aditiva (nada e removido nem renomeado):
- tabela shoe_models, criada VAZIA (a carga do catalogo e uma migration posterior);
- colunas novas em equipment (brand, model, shoe_model_id, initial_distance_km, lifespan_km,
  maintenance_interval_km, last_maintenance_at, retired_at, is_default);
- indice unico PARCIAL (user_id, category) WHERE is_default AND retired_at IS NULL;
- indice PARCIAL runs(equipment_id) WHERE equipment_id IS NOT NULL (agregacao de km por equipamento);
- dado: o tenis e a bike MAIS ANTIGOS de cada usuario viram is_default=true ("o primeiro vira padrao").
NAO apaga os itens luva_faixa/suplemento (fase posterior).

Revision ID: a3f7c9e15b28
Revises: d4a9e6b21f58
Create Date: 2026-10-05 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a3f7c9e15b28'
down_revision: Union[str, Sequence[str], None] = 'd4a9e6b21f58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "shoe_models",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("brand", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("default_lifespan_km", sa.Float(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("search_name", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_shoe_models_search_name"), "shoe_models", ["search_name"], unique=False)

    op.add_column("equipment", sa.Column("brand", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("model", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("shoe_model_id", sa.Integer(), nullable=True))
    op.add_column("equipment", sa.Column("initial_distance_km", sa.Float(), server_default=sa.text("0"), nullable=False))
    op.add_column("equipment", sa.Column("lifespan_km", sa.Float(), nullable=True))
    op.add_column("equipment", sa.Column("maintenance_interval_km", sa.Float(), nullable=True))
    op.add_column("equipment", sa.Column("last_maintenance_at", sa.DateTime(), nullable=True))
    op.add_column("equipment", sa.Column("retired_at", sa.DateTime(), nullable=True))
    op.add_column("equipment", sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_foreign_key(
        "fk_equipment_shoe_model_id", "equipment", "shoe_models", ["shoe_model_id"], ["id"], ondelete="SET NULL"
    )

    # O tenis e a bike mais antigos (nao aposentados -- ninguem esta aposentado ainda) de cada usuario
    # viram o padrao. Roda ANTES do indice unico parcial, que depois garante 1 padrao por (usuario, categoria).
    op.execute(
        """
        UPDATE equipment SET is_default = true
        WHERE id IN (
            SELECT DISTINCT ON (user_id, category) id
            FROM equipment
            WHERE category IN ('tenis', 'bike')
            ORDER BY user_id, category, created_at, id
        )
        """
    )

    op.create_index(
        "uq_equipment_user_category_default",
        "equipment",
        ["user_id", "category"],
        unique=True,
        postgresql_where=sa.text("is_default AND retired_at IS NULL"),
    )
    op.create_index(
        "ix_runs_equipment_id",
        "runs",
        ["equipment_id"],
        unique=False,
        postgresql_where=sa.text("equipment_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_runs_equipment_id", table_name="runs", postgresql_where=sa.text("equipment_id IS NOT NULL"))
    op.drop_index(
        "uq_equipment_user_category_default",
        table_name="equipment",
        postgresql_where=sa.text("is_default AND retired_at IS NULL"),
    )
    op.drop_constraint("fk_equipment_shoe_model_id", "equipment", type_="foreignkey")
    op.drop_column("equipment", "is_default")
    op.drop_column("equipment", "retired_at")
    op.drop_column("equipment", "last_maintenance_at")
    op.drop_column("equipment", "maintenance_interval_km")
    op.drop_column("equipment", "lifespan_km")
    op.drop_column("equipment", "initial_distance_km")
    op.drop_column("equipment", "shoe_model_id")
    op.drop_column("equipment", "model")
    op.drop_column("equipment", "brand")
    op.drop_index(op.f("ix_shoe_models_search_name"), table_name="shoe_models")
    op.drop_table("shoe_models")
