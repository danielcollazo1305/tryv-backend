"""fc_deduplicacao_e_indice: unique (user_id, source, recorded_at) e indice (user_id, recorded_at) em heart_rate_samples

O QUE FAZ (upgrade):
1. REMOVE duplicatas existentes: onde ha mais de uma linha com o mesmo (user_id, source, recorded_at), fica so uma (a de menor ctid; as
   demais sao apagadas). Isso APAGA linhas, mas so copias exatas da mesma leitura (mesmo usuario, fonte e instante).
   O bpm da copia descartada pode diferir do mantido (a leitura duplicada nunca foi confiavel como "outra" leitura).
2. Cria a constraint unica uq_heart_rate_user_source_recorded (usada pelo ON CONFLICT DO NOTHING de POST /heart-rate/sync).
3. Cria o indice ix_heart_rate_samples_user_recorded_at (user_id, recorded_at) para as consultas por janela de tempo.

DOWNGRADE: remove a constraint e o indice. As duplicatas removidas NAO voltam (a limpeza do upgrade e irreversivel por natureza).

Revision ID: b8e2d4f6a1c3
Revises: a7d3f1b8c4e9
Create Date: 2026-11-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b8e2d4f6a1c3'
down_revision: Union[str, Sequence[str], None] = 'a7d3f1b8c4e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Mantem 1 linha por (user_id, source, recorded_at): apaga as que tem outra "irma" com ctid menor.
    op.execute(
        """
        DELETE FROM heart_rate_samples a
        USING heart_rate_samples b
        WHERE a.user_id = b.user_id
          AND a.source = b.source
          AND a.recorded_at = b.recorded_at
          AND a.ctid > b.ctid
        """
    )
    op.create_unique_constraint(
        "uq_heart_rate_user_source_recorded", "heart_rate_samples", ["user_id", "source", "recorded_at"]
    )
    op.create_index("ix_heart_rate_samples_user_recorded_at", "heart_rate_samples", ["user_id", "recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_heart_rate_samples_user_recorded_at", table_name="heart_rate_samples")
    op.drop_constraint("uq_heart_rate_user_source_recorded", "heart_rate_samples", type_="unique")
