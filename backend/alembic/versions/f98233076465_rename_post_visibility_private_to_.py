"""rename post visibility private to followers

Revision ID: f98233076465
Revises: 0055aaaa6e6f
Create Date: 2026-08-18 08:54:06.069551

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f98233076465'
down_revision: Union[str, Sequence[str], None] = '0055aaaa6e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nao e uma coluna nova (posts.visibility ja existia, String livre, sem
    # CHECK constraint) — so um rename de valor. 'private' sempre se
    # comportou como "somente seguidores" (ver _can_view_post em
    # routers/social.py, nunca mudou); o nome antigo so estava impreciso.
    # Nenhum post muda de comportamento por causa desta migration.
    op.execute("UPDATE posts SET visibility = 'followers' WHERE visibility = 'private'")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("UPDATE posts SET visibility = 'private' WHERE visibility = 'followers'")
