"""content_filter_events: tentativas de texto bloqueadas pelo filtro de conteudo (E3e)

Tabela nova, aditiva. SEM texto, SEM termo, SEM IP: so user_id (nulo no cadastro), surface, category e created_at.
IDEMPOTENTE: o create_all do startup local ja pode ter criado a tabela; so cria o que ainda nao existe.

Revision ID: b7e41c9d5a03
Revises: a9d3f7c2b641
Create Date: 2026-10-15 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b7e41c9d5a03'
down_revision: Union[str, Sequence[str], None] = 'a9d3f7c2b641'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "content_filter_events"
_INDEX = "ix_content_filter_events_user_created"


def upgrade() -> None:
    """Upgrade schema."""
    inspector = sa.inspect(op.get_bind())
    if _TABLE not in inspector.get_table_names():
        op.create_table(
            _TABLE,
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('surface', sa.String(length=40), nullable=False),
            sa.Column('category', sa.String(length=20), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        inspector = sa.inspect(op.get_bind())
    if _INDEX not in {ix["name"] for ix in inspector.get_indexes(_TABLE)}:
        op.create_index(_INDEX, _TABLE, ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    inspector = sa.inspect(op.get_bind())
    if _TABLE in inspector.get_table_names():
        if _INDEX in {ix["name"] for ix in inspector.get_indexes(_TABLE)}:
            op.drop_index(_INDEX, table_name=_TABLE)
        op.drop_table(_TABLE)
