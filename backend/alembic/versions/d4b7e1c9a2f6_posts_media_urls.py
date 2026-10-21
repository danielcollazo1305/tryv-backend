"""posts_media_urls: carrossel de fotos (ate 10 por post)

Uma coluna NULLABLE em posts: media_urls (JSON, lista de URLs em ordem; a capa fica tambem em media_url para o app antigo).
Posts antigos ficam com NULL (sem backfill): continuam valendo so com media_url. IDEMPOTENTE: so cria a coluna se nao existir.

Revision ID: d4b7e1c9a2f6
Revises: c8e2a47f1b95
Create Date: 2026-10-21 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd4b7e1c9a2f6'
down_revision: Union[str, Sequence[str], None] = 'c8e2a47f1b95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("posts")}
    if "media_urls" not in existing:
        op.add_column("posts", sa.Column("media_urls", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("posts")}
    if "media_urls" in existing:
        op.drop_column("posts", "media_urls")
