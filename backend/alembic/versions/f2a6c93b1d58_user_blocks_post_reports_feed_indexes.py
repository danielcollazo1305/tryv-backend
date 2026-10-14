"""bloquear/denunciar (user_blocks, post_reports) e indices do feed

Aditiva (nada e removido nem renomeado):
- tabela user_blocks (bloqueio entre usuarios) e post_reports (denuncia de post OU comentario);
- indices de feed: ix_posts_user_created (user_id, created_at DESC), ix_posts_public_created (created_at DESC, id DESC)
  parcial WHERE visibility = 'public', ix_follows_following (following_id), ix_comments_post (post_id).
Os indices sao criados com IF NOT EXISTS e SEM CONCURRENTLY: o Alembic roda em transacao e CREATE INDEX CONCURRENTLY nao
pode rodar dentro dela; as tabelas sao pequenas (o bloqueio de escrita durante a criacao e de segundos).
As tabelas novas so sao criadas se ainda nao existirem (o create_all do startup local pode te-las criado antes).

Revision ID: f2a6c93b1d58
Revises: e4c8a21d9b57
Create Date: 2026-10-14 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f2a6c93b1d58'
down_revision: Union[str, Sequence[str], None] = 'e4c8a21d9b57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("user_blocks"):
        op.create_table(
            "user_blocks",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("blocker_id", sa.UUID(), nullable=False),
            sa.Column("blocked_id", sa.UUID(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint("blocker_id <> blocked_id", name="ck_user_block_not_self"),
            sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block_pair"),
        )
    op.create_index("ix_user_blocks_blocked_id", "user_blocks", ["blocked_id"], unique=False, if_not_exists=True)

    if not inspector.has_table("post_reports"):
        op.create_table(
            "post_reports",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("reporter_id", sa.UUID(), nullable=False),
            sa.Column("post_id", sa.UUID(), nullable=True),
            sa.Column("comment_id", sa.UUID(), nullable=True),
            sa.Column("target_author_id", sa.UUID(), nullable=True),
            sa.Column("target_excerpt", sa.Text(), nullable=True),
            sa.Column("reason", sa.String(length=20), nullable=False),
            sa.Column("details", sa.String(length=500), nullable=True),
            sa.Column("status", sa.String(length=10), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by", sa.UUID(), nullable=True),
            sa.CheckConstraint(
                "(post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL)",
                name="ck_post_report_one_target",
            ),
            sa.CheckConstraint(
                "reason IN ('spam','assedio','nudez','violencia','menor','outro')", name="ck_post_report_reason"
            ),
            sa.CheckConstraint("status IN ('open','actioned','dismissed')", name="ck_post_report_status"),
            sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["target_author_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
    op.create_index(
        "uq_post_report_reporter_post", "post_reports", ["reporter_id", "post_id"], unique=True,
        postgresql_where=sa.text("post_id IS NOT NULL"), if_not_exists=True,
    )
    op.create_index(
        "uq_post_report_reporter_comment", "post_reports", ["reporter_id", "comment_id"], unique=True,
        postgresql_where=sa.text("comment_id IS NOT NULL"), if_not_exists=True,
    )
    op.create_index("ix_post_reports_status_created", "post_reports", ["status", "created_at"], unique=False, if_not_exists=True)
    op.create_index(
        "ix_post_reports_post_id", "post_reports", ["post_id"], unique=False,
        postgresql_where=sa.text("post_id IS NOT NULL"), if_not_exists=True,
    )
    op.create_index(
        "ix_post_reports_comment_id", "post_reports", ["comment_id"], unique=False,
        postgresql_where=sa.text("comment_id IS NOT NULL"), if_not_exists=True,
    )

    # Indices do feed (tabelas existentes, so tinham a PK).
    op.create_index("ix_posts_user_created", "posts", ["user_id", sa.text("created_at DESC")], unique=False, if_not_exists=True)
    op.create_index(
        "ix_posts_public_created", "posts", [sa.text("created_at DESC"), sa.text("id DESC")], unique=False,
        postgresql_where=sa.text("visibility = 'public'"), if_not_exists=True,
    )
    op.create_index("ix_follows_following", "follows", ["following_id"], unique=False, if_not_exists=True)
    op.create_index("ix_comments_post", "comments", ["post_id"], unique=False, if_not_exists=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_comments_post", table_name="comments", if_exists=True)
    op.drop_index("ix_follows_following", table_name="follows", if_exists=True)
    op.drop_index("ix_posts_public_created", table_name="posts", if_exists=True)
    op.drop_index("ix_posts_user_created", table_name="posts", if_exists=True)
    op.drop_table("post_reports")
    op.drop_table("user_blocks")
