"""users.avatar_thumb_url: miniatura 256x256 WebP do avatar

Aditiva (nada e removido nem renomeado): coluna users.avatar_thumb_url (String, nullable, sem default). Avatares
ja existentes ficam com null (o app cai na imagem grande); nao ha backfill.

Revision ID: c5a1e8d27f40
Revises: b8e2d7f4c1a9
Create Date: 2026-10-09 02:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5a1e8d27f40'
down_revision: Union[str, Sequence[str], None] = 'b8e2d7f4c1a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("avatar_thumb_url", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "avatar_thumb_url")
