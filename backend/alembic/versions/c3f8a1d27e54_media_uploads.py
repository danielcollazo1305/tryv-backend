"""media_uploads: fotos de post aprovadas pela analise automatica (E3e fase 4)

Tabela nova, aditiva: id, user_id (FK ON DELETE CASCADE), folder, url, created_at. Sem a imagem.
IDEMPOTENTE: o create_all do startup local ja pode ter criado a tabela; so cria o que ainda nao existe.

Revision ID: c3f8a1d27e54
Revises: b7e41c9d5a03
Create Date: 2026-10-15 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3f8a1d27e54'
down_revision: Union[str, Sequence[str], None] = 'b7e41c9d5a03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "media_uploads"
_INDEXES = {
    "ix_media_uploads_user_created": ['user_id', 'created_at'],
    "ix_media_uploads_url": ['url'],
}


def upgrade() -> None:
    """Upgrade schema."""
    inspector = sa.inspect(op.get_bind())
    if _TABLE not in inspector.get_table_names():
        op.create_table(
            _TABLE,
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('folder', sa.String(length=20), nullable=False),
            sa.Column('url', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        inspector = sa.inspect(op.get_bind())
    existing = {ix["name"] for ix in inspector.get_indexes(_TABLE)}
    for name, columns in _INDEXES.items():
        if name not in existing:
            op.create_index(name, _TABLE, columns, unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    inspector = sa.inspect(op.get_bind())
    if _TABLE in inspector.get_table_names():
        existing = {ix["name"] for ix in inspector.get_indexes(_TABLE)}
        for name in _INDEXES:
            if name in existing:
                op.drop_index(name, table_name=_TABLE)
        op.drop_table(_TABLE)
