"""assinatura_por_provedor: colunas de provedor em subscriptions e registro de eventos de webhook (aditiva)

Somente ADICIONA (nada e removido, renomeado nem alterado):
- subscriptions: provider, provider_customer_id, product_id, expires_at, environment, last_event_at (todas NULLABLE);
- indice unico parcial uq_subscriptions_user_revenuecat_base (1 assinatura Pro por usuario no provedor 'revenuecat');
- tabela nova subscription_webhook_events (idempotencia por ID do evento).

Backfill: linhas existentes com stripe_subscription_id preenchido ganham provider='stripe'. Idempotente (so onde provider IS NULL).
O downgrade remove SO o que esta migration criou; as linhas de subscriptions e as colunas antigas ficam intactas.

Revision ID: a7d3f1b8c4e9
Revises: e5c9a3d7b1f2
Create Date: 2026-11-08 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a7d3f1b8c4e9'
down_revision: Union[str, Sequence[str], None] = 'e5c9a3d7b1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = [
    ("provider", sa.String()),
    ("provider_customer_id", sa.String()),
    ("product_id", sa.String()),
    ("expires_at", sa.DateTime()),
    ("environment", sa.String()),
    ("last_event_at", sa.DateTime()),
]


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("subscriptions", sa.Column(name, type_, nullable=True))

    op.create_index(
        "uq_subscriptions_user_revenuecat_base",
        "subscriptions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("provider = 'revenuecat' AND type = 'base'"),
    )

    op.create_table(
        "subscription_webhook_events",
        sa.Column("event_id", sa.String(), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=True),
        sa.Column("received_at", sa.DateTime(), nullable=False),
    )

    op.execute(
        "UPDATE subscriptions SET provider = 'stripe' "
        "WHERE provider IS NULL AND stripe_subscription_id IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_table("subscription_webhook_events")
    op.drop_index("uq_subscriptions_user_revenuecat_base", table_name="subscriptions")
    for name, _type in reversed(COLUMNS):
        op.drop_column("subscriptions", name)
