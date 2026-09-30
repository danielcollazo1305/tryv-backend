"""add equipment table and equipment_id to activities

Revision ID: d9be7376abd4
Revises: 06688bb81086
Create Date: 2026-09-30 00:09:35.996181

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd9be7376abd4'
down_revision: Union[str, Sequence[str], None] = '06688bb81086'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "equipment",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_equipment_user_id", "equipment", ["user_id"])

    op.add_column("runs", sa.Column("equipment_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_runs_equipment_id", "runs", "equipment", ["equipment_id"], ["id"], ondelete="SET NULL"
    )

    op.add_column("manual_activities", sa.Column("equipment_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_manual_activities_equipment_id",
        "manual_activities",
        "equipment",
        ["equipment_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("workout_sessions", sa.Column("equipment_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_workout_sessions_equipment_id",
        "workout_sessions",
        "equipment",
        ["equipment_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_workout_sessions_equipment_id", "workout_sessions", type_="foreignkey")
    op.drop_column("workout_sessions", "equipment_id")

    op.drop_constraint("fk_manual_activities_equipment_id", "manual_activities", type_="foreignkey")
    op.drop_column("manual_activities", "equipment_id")

    op.drop_constraint("fk_runs_equipment_id", "runs", type_="foreignkey")
    op.drop_column("runs", "equipment_id")

    op.drop_index("ix_equipment_user_id", table_name="equipment")
    op.drop_table("equipment")
