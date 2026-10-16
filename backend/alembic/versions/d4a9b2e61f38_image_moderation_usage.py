"""image_moderation_usage: contador global diario de chamadas a IA na analise de fotos (teto de gasto)

Tabela nova, aditiva e SEM dados de usuario (dia, contagem e duas marcas de alerta ja logado). IDEMPOTENTE: o create_all do startup
local ja pode ter criado a tabela; so cria o que ainda nao existe.

Revision ID: d4a9b2e61f38
Revises: c3f8a1d27e54
Create Date: 2026-10-16 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd4a9b2e61f38'
down_revision: Union[str, Sequence[str], None] = 'c3f8a1d27e54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "image_moderation_usage"


def upgrade() -> None:
    """Upgrade schema."""
    if _TABLE not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            _TABLE,
            sa.Column('day', sa.Date(), nullable=False),
            sa.Column('calls', sa.Integer(), server_default=sa.text('0'), nullable=False),
            sa.Column('alert_logged', sa.Boolean(), server_default=sa.text('false'), nullable=False),
            sa.Column('cap_logged', sa.Boolean(), server_default=sa.text('false'), nullable=False),
            sa.PrimaryKeyConstraint('day'),
        )


def downgrade() -> None:
    """Downgrade schema."""
    if _TABLE in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table(_TABLE)
