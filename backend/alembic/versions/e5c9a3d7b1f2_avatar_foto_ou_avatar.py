"""avatar_foto_ou_avatar: foto de perfil guardada em privado, escolha foto/avatar, consentimento e teto de tentativas

Colunas NULLABLE em users: profile_photo_key, profile_photo_thumb_key, generated_avatar_key, generated_avatar_thumb_key (chaves do S3, nunca URLs
publicas), avatar_source ('photo' | 'avatar'), avatar_consent_at e avatar_consent_version. Tabela nova avatar_attempts (teto diario de tentativas).

Backfill: quem ja tem avatar (avatar_url) passa a ter avatar_source='avatar' e generated_avatar_key/_thumb_key = a chave da propria imagem publica
atual (profiles/...), para o avatar antigo virar a alternativa "avatar" sem copiar nada. Essas imagens continuam publicas (ja eram); so as novas
ficam em private/profile/. IDEMPOTENTE: so cria o que nao existir e so preenche onde esta vazio.

Revision ID: e5c9a3d7b1f2
Revises: d4b7e1c9a2f6
Create Date: 2026-11-03 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e5c9a3d7b1f2'
down_revision: Union[str, Sequence[str], None] = 'd4b7e1c9a2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

USER_COLUMNS = [
    ("profile_photo_key", sa.String()),
    ("profile_photo_thumb_key", sa.String()),
    ("generated_avatar_key", sa.String()),
    ("generated_avatar_thumb_key", sa.String()),
    ("avatar_source", sa.String()),
    ("avatar_consent_at", sa.DateTime()),
    ("avatar_consent_version", sa.String()),
]


def upgrade() -> None:
    """Upgrade schema."""
    inspector = sa.inspect(op.get_bind())
    existing = {c["name"] for c in inspector.get_columns("users")}
    for name, column_type in USER_COLUMNS:
        if name not in existing:
            op.add_column("users", sa.Column(name, column_type, nullable=True))

    if "avatar_attempts" not in inspector.get_table_names():
        op.create_table(
            "avatar_attempts",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_avatar_attempts_user_id", "avatar_attempts", ["user_id"])

    # Backfill: avatar antigo vira a alternativa "avatar" (chave = caminho depois do host da URL publica).
    op.execute(
        """
        UPDATE users
        SET avatar_source = 'avatar',
            generated_avatar_key = regexp_replace(avatar_url, '^https?://[^/]+/', ''),
            generated_avatar_thumb_key = CASE WHEN avatar_thumb_url IS NULL THEN NULL
                                              ELSE regexp_replace(avatar_thumb_url, '^https?://[^/]+/', '') END
        WHERE avatar_url IS NOT NULL AND avatar_source IS NULL AND generated_avatar_key IS NULL
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    inspector = sa.inspect(op.get_bind())
    if "avatar_attempts" in inspector.get_table_names():
        op.drop_index("ix_avatar_attempts_user_id", table_name="avatar_attempts")
        op.drop_table("avatar_attempts")
    existing = {c["name"] for c in inspector.get_columns("users")}
    for name, _ in reversed(USER_COLUMNS):
        if name in existing:
            op.drop_column("users", name)
