"""add city ibge code to users

Revision ID: 1a3e70e54c9f
Revises: d4c1a7f93b02
Create Date: 2026-09-28 19:46:41.570084

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a3e70e54c9f'
down_revision: Union[str, Sequence[str], None] = 'd4c1a7f93b02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("city_ibge_code", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_users_city_ibge_code"), "users", ["city_ibge_code"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_users_city_ibge_code"), table_name="users")
    op.drop_column("users", "city_ibge_code")
