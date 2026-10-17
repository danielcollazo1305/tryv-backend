"""posts_origin_explore_index: posts.origin ('manual'|'auto'|'legacy') e indice parcial do feed Explorar

Coluna nova NOT NULL com padrao 'legacy': todo post que ja existe vira 'legacy' (nunca 'manual' por palpite; so o app novo marca
'manual'). IDEMPOTENTE: o create_all/migracao parcial anterior pode ja ter criado coluna, constraint ou indice; so cria o que falta.

Revision ID: a7c3e19f5d02
Revises: d4a9b2e61f38
Create Date: 2026-10-16 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a7c3e19f5d02'
down_revision: Union[str, Sequence[str], None] = 'd4a9b2e61f38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = "ix_posts_explore_created"
_CHECK = "ck_posts_origin"


def upgrade() -> None:
    """Upgrade schema."""
    inspector = sa.inspect(op.get_bind())
    columns = {c["name"] for c in inspector.get_columns("posts")}
    if "origin" not in columns:
        op.add_column("posts", sa.Column("origin", sa.String(length=10), server_default="legacy", nullable=False))
    if _CHECK not in {c["name"] for c in inspector.get_check_constraints("posts")}:
        op.create_check_constraint(_CHECK, "posts", "origin IN ('manual','auto','legacy')")
    op.create_index(
        _INDEX, "posts", [sa.text("created_at DESC"), sa.text("id DESC")], unique=False,
        postgresql_where=sa.text("visibility = 'public' AND origin = 'manual'"), if_not_exists=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    inspector = sa.inspect(op.get_bind())
    op.drop_index(_INDEX, table_name="posts", if_exists=True)
    if _CHECK in {c["name"] for c in inspector.get_check_constraints("posts")}:
        op.drop_constraint(_CHECK, "posts", type_="check")
    if "origin" in {c["name"] for c in inspector.get_columns("posts")}:
        op.drop_column("posts", "origin")
