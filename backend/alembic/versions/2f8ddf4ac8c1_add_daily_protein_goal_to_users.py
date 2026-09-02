"""add daily protein goal to users

Revision ID: 2f8ddf4ac8c1
Revises: c74782f6d30f
Create Date: 2026-09-02 00:48:42.660560

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f8ddf4ac8c1'
down_revision: Union[str, Sequence[str], None] = 'c74782f6d30f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("daily_protein_goal", sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "daily_protein_goal")
