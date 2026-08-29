"""plan_id_nullable_and_user_id_on_workout_sessions

Revision ID: 8b4b1f22e0c8
Revises: 1d5cd7d51470
Create Date: 2026-08-25 00:52:44.775894

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '8b4b1f22e0c8'
down_revision: Union[str, Sequence[str], None] = '1d5cd7d51470'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Suporte a sessao de treino "livre" (sem plano associado, exercicios
    escolhidos manualmente): plan_id vira nullable (sessao livre nao tem
    workout_plans.id nenhum) e ganha user_id direto na tabela (sessao livre
    nao tem plano pra derivar o dono, e sessoes de plano tambem passam a
    preencher isso, permitindo consultar o historico inteiro do usuario
    num JOIN so). Tabela workout_sessions esta vazia em producao/dev no
    momento desta migration (confirmado antes de escrever) — user_id pode
    nascer NOT NULL direto, sem precisar de backfill.
    """
    op.alter_column("workout_sessions", "plan_id", nullable=True)
    op.add_column(
        "workout_sessions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_foreign_key(
        "fk_workout_sessions_user_id_users",
        "workout_sessions",
        "users",
        ["user_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_workout_sessions_user_id_users", "workout_sessions", type_="foreignkey")
    op.drop_column("workout_sessions", "user_id")
    op.alter_column("workout_sessions", "plan_id", nullable=False)
