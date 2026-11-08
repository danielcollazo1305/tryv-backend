import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"
    # Uma assinatura Pro (type='base') por usuario por provedor 'revenuecat' (migration a7d3f1b8c4e9): e o que torna o
    # upsert do webhook seguro contra corrida. Linhas do Stripe (varias por usuario, ao reassinar) ficam de fora.
    __table_args__ = (
        Index(
            "uq_subscriptions_user_revenuecat_base",
            "user_id",
            unique=True,
            postgresql_where=text("provider = 'revenuecat' AND type = 'base'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    type = Column(String, nullable=False)  # 'base' | 'trainer_addon'
    trainer_id = Column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=True)

    stripe_subscription_id = Column(String, nullable=True)
    status = Column(String, default="active")  # 'active' | 'canceled' | 'past_due'

    created_at = Column(DateTime, default=datetime.utcnow)

    # Assinatura por provedor (migration a7d3f1b8c4e9). Tudo NULLABLE: linhas antigas do Stripe nao usam expires_at
    # (NULL = vale pelo status, como sempre foi).
    provider = Column(String, nullable=True)  # 'stripe' | 'revenuecat'
    provider_customer_id = Column(String, nullable=True)  # RevenueCat: app_user_id (= id do usuario no Tryv)
    product_id = Column(String, nullable=True)  # ID do produto na loja (ex.: o produto mensal do Pro)
    expires_at = Column(DateTime, nullable=True)  # UTC naive; fim do periodo pago (ou da carencia de cobranca)
    environment = Column(String, nullable=True)  # 'sandbox' | 'production'
    last_event_at = Column(DateTime, nullable=True)  # UTC naive; instante do ultimo evento aplicado (ignora eventos fora de ordem)


class SubscriptionWebhookEvent(Base):
    """Eventos de webhook de assinatura ja processados (idempotencia por ID do evento). Sem FK de proposito: nao e dado do
    usuario, so um registro de 'este evento ja foi aplicado'."""

    __tablename__ = "subscription_webhook_events"

    event_id = Column(String, primary_key=True)
    provider = Column(String, nullable=False)
    event_type = Column(String, nullable=True)
    received_at = Column(DateTime, default=datetime.utcnow, nullable=False)
