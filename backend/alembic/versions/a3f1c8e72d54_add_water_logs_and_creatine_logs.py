"""add water_logs and creatine_logs tables

Revision ID: a3f1c8e72d54
Revises: d9be7376abd4
Create Date: 2026-10-03 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a3f1c8e72d54'
down_revision: Union[str, Sequence[str], None] = 'd9be7376abd4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "water_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount_ml", sa.Integer(), nullable=False),
        sa.Column("logged_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_water_logs_user_id"), "water_logs", ["user_id"], unique=False)

    op.create_table(
        "creatine_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("logged_at", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "logged_at", name="uq_creatine_log_user_date"),
    )
    op.create_index(op.f("ix_creatine_logs_user_id"), "creatine_logs", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_creatine_logs_user_id"), table_name="creatine_logs")
    op.drop_table("creatine_logs")
    op.drop_index(op.f("ix_water_logs_user_id"), table_name="water_logs")
    op.drop_table("water_logs")
