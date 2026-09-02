"""add invite_code to squads

Revision ID: 826ea09fd191
Revises: 2f8ddf4ac8c1
Create Date: 2026-09-02 01:23:32.746435

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '826ea09fd191'
down_revision: Union[str, Sequence[str], None] = '2f8ddf4ac8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # nullable=False direto (sem backfill) -- squads ainda nao existe em
    # nenhum banco real (Fase 1 nunca foi aplicada), entao a tabela estara
    # vazia quando esta migration rodar pela primeira vez.
    op.add_column("squads", sa.Column("invite_code", sa.String(length=6), nullable=False))
    op.create_index("ix_squads_invite_code", "squads", ["invite_code"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_squads_invite_code", table_name="squads")
    op.drop_column("squads", "invite_code")
