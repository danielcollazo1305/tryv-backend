"""ai_usage: registro de uso da IA (tokens por chamada) e base do teto diario por usuario (aditiva)

Somente ADICIONA a tabela ai_usage (user_id, feature, model, input_tokens, output_tokens, created_at) e o indice
ix_ai_usage_user_feature_created_at. Nada existente e alterado. A tabela guarda so numeros, nunca prompt nem resposta.
O downgrade remove SO o que esta migration criou.

Revision ID: c9f3a5e7b2d4
Revises: b8e2d4f6a1c3
Create Date: 2026-11-17 11:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c9f3a5e7b2d4'
down_revision: Union[str, Sequence[str], None] = 'b8e2d4f6a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("feature", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_ai_usage_user_feature_created_at", "ai_usage", ["user_id", "feature", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_usage_user_feature_created_at", table_name="ai_usage")
    op.drop_table("ai_usage")
