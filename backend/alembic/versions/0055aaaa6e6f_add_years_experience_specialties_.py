"""add years_experience specialties certifications to trainers

Revision ID: 0055aaaa6e6f
Revises: 6a4753b348f5
Create Date: 2026-08-17 22:21:55.734459

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0055aaaa6e6f'
down_revision: Union[str, Sequence[str], None] = '6a4753b348f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("trainers", sa.Column("years_experience", sa.Integer(), nullable=True))
    op.add_column(
        "trainers",
        sa.Column("specialties", sa.ARRAY(sa.String()), nullable=True, server_default="{}"),
    )
    op.alter_column("trainers", "specialties", server_default=None)
    op.add_column("trainers", sa.Column("certifications", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("trainers", "certifications")
    op.drop_column("trainers", "specialties")
    op.drop_column("trainers", "years_experience")
