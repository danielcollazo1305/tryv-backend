"""add squad xp territory tables

Revision ID: c74782f6d30f
Revises: 8b4b1f22e0c8
Create Date: 2026-09-02 00:29:38.840546

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c74782f6d30f'
down_revision: Union[str, Sequence[str], None] = '8b4b1f22e0c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "squads",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_squads_created_by", "squads", ["created_by"])

    op.create_table(
        "squad_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("squad_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["squad_id"], ["squads.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_squad_membership_user"),
    )
    op.create_index("ix_squad_memberships_squad_id", "squad_memberships", ["squad_id"])

    op.create_table(
        "points_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_points_events_user_id", "points_events", ["user_id"])
    op.create_index("ix_points_events_created_at", "points_events", ["created_at"])
    op.create_index(
        "uq_points_event_user_source_id",
        "points_events",
        ["user_id", "source_type", "source_id"],
        unique=True,
        postgresql_where=sa.text("source_id IS NOT NULL"),
    )
    op.create_index(
        "uq_points_event_user_source_date",
        "points_events",
        ["user_id", "source_type", "source_date"],
        unique=True,
        postgresql_where=sa.text("source_date IS NOT NULL"),
    )

    op.add_column("users", sa.Column("city", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "city")

    op.drop_index("uq_points_event_user_source_date", table_name="points_events")
    op.drop_index("uq_points_event_user_source_id", table_name="points_events")
    op.drop_index("ix_points_events_created_at", table_name="points_events")
    op.drop_index("ix_points_events_user_id", table_name="points_events")
    op.drop_table("points_events")

    op.drop_index("ix_squad_memberships_squad_id", table_name="squad_memberships")
    op.drop_table("squad_memberships")

    op.drop_index("ix_squads_created_by", table_name="squads")
    op.drop_table("squads")
