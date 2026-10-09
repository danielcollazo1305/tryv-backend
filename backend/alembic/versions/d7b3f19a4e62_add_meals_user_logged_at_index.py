"""meals: indice (user_id, logged_at)

Aditiva: indice ix_meals_user_logged_at em meals(user_id, logged_at), para as consultas por usuario e dia
(GET /meals/days, GET /meals/?date=, GET /meals/summary). A tabela so tinha a PK.

Revision ID: d7b3f19a4e62
Revises: c5a1e8d27f40
Create Date: 2026-10-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd7b3f19a4e62'
down_revision: Union[str, Sequence[str], None] = 'c5a1e8d27f40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index("ix_meals_user_logged_at", "meals", ["user_id", "logged_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_meals_user_logged_at", table_name="meals")
