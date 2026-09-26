"""add external_source/external_id to runs and manual_activities

Revision ID: d4c1a7f93b02
Revises: 7e363954b50f
Create Date: 2026-09-24 09:15:00.000000

Idempotencia da importacao de treinos do Apple Health / Health Connect.

As duas colunas ficam NULL em tudo que ja existe (atividades gravadas dentro
do app e importacoes feitas antes desta migration) — por isso sao nullable e
por isso o indice unico e PARCIAL (WHERE external_id IS NOT NULL): sem o
parcial, varias linhas com NULL colidiriam entre si em alguns bancos e a
migration quebraria em producao com dados reais.

Escrita a mao (nao autogenerate): `alembic revision --autogenerate` nao gera
o `postgresql_where` do indice parcial — geraria um UNIQUE comum, que e
exatamente o que nao pode ser usado aqui.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4c1a7f93b02'
down_revision: Union[str, Sequence[str], None] = '7e363954b50f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("runs", sa.Column("external_source", sa.String(), nullable=True))
    op.add_column("runs", sa.Column("external_id", sa.String(), nullable=True))
    op.create_index(
        "ix_runs_user_external_unique",
        "runs",
        ["user_id", "external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    op.add_column("manual_activities", sa.Column("external_source", sa.String(), nullable=True))
    op.add_column("manual_activities", sa.Column("external_id", sa.String(), nullable=True))
    op.create_index(
        "ix_manual_activities_user_external_unique",
        "manual_activities",
        ["user_id", "external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_manual_activities_user_external_unique", table_name="manual_activities")
    op.drop_column("manual_activities", "external_id")
    op.drop_column("manual_activities", "external_source")

    op.drop_index("ix_runs_user_external_unique", table_name="runs")
    op.drop_column("runs", "external_id")
    op.drop_column("runs", "external_source")
