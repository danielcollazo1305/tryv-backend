"""rename cref_number to license_number

Revision ID: a1f3c9b7d2e4
Revises: cb4f24d7119d
Create Date: 2026-08-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1f3c9b7d2e4'
down_revision: Union[str, Sequence[str], None] = 'cb4f24d7119d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Rename puro de coluna — preserva o valor de cada linha existente
    automaticamente, sem precisar de server_default (isso so seria
    necessario pra ADICIONAR uma coluna NOT NULL nova numa tabela ja
    populada, nao pra renomear uma que ja existe). Testado contra uma
    copia com dado existente antes de aplicar — ver relatorio da tarefa.
    """
    op.alter_column('trainers', 'cref_number', new_column_name='license_number')


def downgrade() -> None:
    op.alter_column('trainers', 'license_number', new_column_name='cref_number')
