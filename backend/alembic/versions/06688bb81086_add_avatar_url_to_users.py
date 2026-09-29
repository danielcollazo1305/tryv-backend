"""add avatar url to users

Revision ID: 06688bb81086
Revises: 1a3e70e54c9f
Create Date: 2026-09-28 22:46:51.670649

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '06688bb81086'
down_revision: Union[str, Sequence[str], None] = '1a3e70e54c9f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "avatar_url")
