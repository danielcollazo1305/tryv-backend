"""add expires_at to workout_plans with backfill

Revision ID: 6a4753b348f5
Revises: 5fa564c91b21
Create Date: 2026-08-17 21:49:45.368675

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a4753b348f5'
down_revision: Union[str, Sequence[str], None] = '5fa564c91b21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("workout_plans", sa.Column("expires_at", sa.DateTime(), nullable=True))
    # Backfill: planos ja existentes de source='ai' ganham expires_at
    # calculado a partir do created_at de cada um (8 semanas), em vez de
    # ficar nulo — assim a expiracao funciona de forma consistente pra
    # planos que ja existiam antes desta migration, nao so pros novos.
    # Planos source='trainer' (se algum existir) ficam com expires_at nulo
    # de proposito (nunca expiram automaticamente, ver models/workout.py).
    op.execute(
        "UPDATE workout_plans SET expires_at = created_at + INTERVAL '8 weeks' WHERE source = 'ai'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("workout_plans", "expires_at")
