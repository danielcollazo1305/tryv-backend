"""add onboarding expandido fields to users

Revision ID: bb59f6c17417
Revises: 0579302b4c20
Create Date: 2026-08-17 15:03:11.402404

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bb59f6c17417'
down_revision: Union[str, Sequence[str], None] = '0579302b4c20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("biological_sex", sa.String(), nullable=True))
    op.add_column("users", sa.Column("body_fat_percentage", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("training_level", sa.String(), nullable=True))
    op.add_column("users", sa.Column("available_equipment", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "available_equipment")
    op.drop_column("users", "training_level")
    op.drop_column("users", "body_fat_percentage")
    op.drop_column("users", "biological_sex")
    op.drop_column("users", "date_of_birth")
