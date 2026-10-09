"""meals.photo_thumb_url: miniatura 320x240 WebP da foto da refeicao

Aditiva (nada e removido nem renomeado): coluna meals.photo_thumb_url (String, nullable, sem default). Refeicoes
existentes ficam com null (o app cai na foto original); nao ha backfill.

Revision ID: e4c8a21d9b57
Revises: d7b3f19a4e62
Create Date: 2026-10-09 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4c8a21d9b57'
down_revision: Union[str, Sequence[str], None] = 'd7b3f19a4e62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("meals", sa.Column("photo_thumb_url", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("meals", "photo_thumb_url")
