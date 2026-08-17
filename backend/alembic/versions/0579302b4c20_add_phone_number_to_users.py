"""add phone_number to users

Revision ID: 0579302b4c20
Revises: 230a37099781
Create Date: 2026-08-16 23:29:35.625913

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0579302b4c20'
down_revision: Union[str, Sequence[str], None] = '230a37099781'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("phone_number", sa.String(), nullable=True))
    op.create_index(op.f("ix_users_phone_number"), "users", ["phone_number"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_users_phone_number"), table_name="users")
    op.drop_column("users", "phone_number")
