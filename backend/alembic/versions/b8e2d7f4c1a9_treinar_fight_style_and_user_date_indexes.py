"""treinar: manual_activities.fight_style + indices (user_id, data) em runs/manual_activities/workout_sessions

Aditiva (nada e removido nem renomeado):
- coluna manual_activities.fight_style (String, nullable, sem default): estilo de luta (boxe, muay_thai,
  jiu_jitsu, mma, judo, karate, outra), validado no schema, nao enum de banco;
- indices (user_id, <instante>) pra consultas por usuario e data (GET /dashboard/modalities, listagens):
  ix_runs_user_started_at, ix_manual_activities_user_performed_at, ix_workout_sessions_user_completed_at.
  Nenhuma das 3 tabelas tinha indice por usuario/data (so PK e os parciais de importacao/equipamento).

Revision ID: b8e2d7f4c1a9
Revises: a3f7c9e15b28
Create Date: 2026-10-05 19:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8e2d7f4c1a9'
down_revision: Union[str, Sequence[str], None] = 'a3f7c9e15b28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("manual_activities", sa.Column("fight_style", sa.String(), nullable=True))
    op.create_index("ix_runs_user_started_at", "runs", ["user_id", "started_at"], unique=False)
    op.create_index(
        "ix_manual_activities_user_performed_at", "manual_activities", ["user_id", "performed_at"], unique=False
    )
    op.create_index(
        "ix_workout_sessions_user_completed_at", "workout_sessions", ["user_id", "completed_at"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_workout_sessions_user_completed_at", table_name="workout_sessions")
    op.drop_index("ix_manual_activities_user_performed_at", table_name="manual_activities")
    op.drop_index("ix_runs_user_started_at", table_name="runs")
    op.drop_column("manual_activities", "fight_style")
