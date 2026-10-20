"""users_username_bio_link: @usuario (unico sem diferenciar maiusculas), bio (ate 150), link (ate 200) e quando o @usuario foi trocado

Quatro colunas NULLABLE em users (contas antigas ficam com NULL; nada de backfill): username, bio, link e username_changed_at (limite
de uma troca de @usuario a cada 30 dias, nunca exposta na API) e indice unico sobre lower(username).
IDEMPOTENTE: o create_all/migracao parcial anterior pode ja ter criado colunas ou o indice; so cria o que falta.

Revision ID: c8e2a47f1b95
Revises: a7c3e19f5d02
Create Date: 2026-10-20 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c8e2a47f1b95'
down_revision: Union[str, Sequence[str], None] = 'a7c3e19f5d02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = "uq_users_username_lower"
_COLUMNS = (
    ("username", sa.String(length=20)),
    ("bio", sa.String(length=150)),
    ("link", sa.String(length=200)),
    ("username_changed_at", sa.DateTime()),
)


def upgrade() -> None:
    """Upgrade schema."""
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    for name, column_type in _COLUMNS:
        if name not in existing:
            op.add_column("users", sa.Column(name, column_type, nullable=True))
    op.create_index(_INDEX, "users", [sa.text("lower(username)")], unique=True, if_not_exists=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(_INDEX, table_name="users", if_exists=True)
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    for name, _type in reversed(_COLUMNS):
        if name in existing:
            op.drop_column("users", name)
