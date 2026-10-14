"""post_reports.reporter_id anulavel, com ON DELETE SET NULL (exclusao de conta)

Aditiva/afrouxa a restricao: o denunciante que exclui a conta nao leva a denuncia junto (antes: ON DELETE CASCADE e NOT
NULL); a denuncia continua como registro de moderacao, anonima (reporter_id NULL). Os indices unicos parciais
(reporter_id, post_id/comment_id) continuam valendo (NULLs sao distintos).
IDEMPOTENTE: o create_all do startup local ja cria a tabela com o modelo novo; so altera o que ainda nao esta assim.
Downgrade: apaga as denuncias sem denunciante (nao ha como voltar a NOT NULL sem isso) e restaura NOT NULL + CASCADE.

Revision ID: a9d3f7c2b641
Revises: f2a6c93b1d58
Create Date: 2026-10-14 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a9d3f7c2b641'
down_revision: Union[str, Sequence[str], None] = 'f2a6c93b1d58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FK_NAME = "post_reports_reporter_id_fkey"


def _reporter_fk(inspector):
    for fk in inspector.get_foreign_keys("post_reports"):
        if fk.get("constrained_columns") == ["reporter_id"]:
            return fk
    return None


def _reporter_nullable(inspector) -> bool:
    return next(c["nullable"] for c in inspector.get_columns("post_reports") if c["name"] == "reporter_id")


def upgrade() -> None:
    """Upgrade schema."""
    inspector = sa.inspect(op.get_bind())
    if not _reporter_nullable(inspector):
        op.alter_column("post_reports", "reporter_id", existing_type=sa.UUID(), nullable=True)
    fk = _reporter_fk(inspector)
    if fk is None or (fk.get("options") or {}).get("ondelete") != "SET NULL":
        if fk is not None:
            op.drop_constraint(fk["name"], "post_reports", type_="foreignkey")
        op.create_foreign_key(_FK_NAME, "post_reports", "users", ["reporter_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM post_reports WHERE reporter_id IS NULL")
    inspector = sa.inspect(op.get_bind())
    fk = _reporter_fk(inspector)
    if fk is not None:
        op.drop_constraint(fk["name"], "post_reports", type_="foreignkey")
    op.create_foreign_key(_FK_NAME, "post_reports", "users", ["reporter_id"], ["id"], ondelete="CASCADE")
    op.alter_column("post_reports", "reporter_id", existing_type=sa.UUID(), nullable=False)
