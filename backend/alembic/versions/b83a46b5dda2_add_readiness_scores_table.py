"""add readiness_scores table

Revision ID: b83a46b5dda2
Revises: 44d2ec8ecb90
Create Date: 2026-08-01 13:01:24.148935

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b83a46b5dda2'
down_revision: Union[str, Sequence[str], None] = '44d2ec8ecb90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Autogenerate nao detectou diff porque o create_all() de conveniencia em
    # app/main.py ja tinha criado a tabela neste banco de dev — escrito a mao
    # pra migration ser real em qualquer outro ambiente (staging/producao).
    op.create_table(
        "readiness_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("sleep_score", sa.Float(), nullable=True),
        sa.Column("load_score", sa.Float(), nullable=True),
        sa.Column("hr_score", sa.Float(), nullable=True),
        sa.Column("final_score", sa.Float(), nullable=False),
        sa.Column("recommendation_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_readiness_score_user_date"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("readiness_scores")
