"""add is_official, category to challenges and create challenge_checkins

Revision ID: 5fa564c91b21
Revises: bb59f6c17417
Create Date: 2026-08-17 20:24:15.521571

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5fa564c91b21'
down_revision: Union[str, Sequence[str], None] = 'bb59f6c17417'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column("challenges", "trainer_id", existing_type=sa.UUID(), nullable=True)
    op.add_column(
        "challenges",
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("challenges", "is_official", server_default=None)
    op.add_column("challenges", sa.Column("category", sa.String(), nullable=True))

    op.create_table(
        "challenge_checkins",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("challenge_id", sa.UUID(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("photo_url", sa.String(), nullable=True),
        sa.Column("shared_publicly", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["challenge_id"], ["challenges.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "challenge_id", "date", name="uq_challenge_checkin_user_day"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("challenge_checkins")
    op.drop_column("challenges", "category")
    op.drop_column("challenges", "is_official")
    op.alter_column("challenges", "trainer_id", existing_type=sa.UUID(), nullable=False)
