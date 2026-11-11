from datetime import datetime

from pydantic import BaseModel


class IapSyncOut(BaseModel):
    """Estado da assinatura Pro por compra no app, como o webhook do RevenueCat registrou (nunca o que o app afirma)."""
    is_pro: bool
    # True = ainda nao ha registro desta assinatura (o webhook pode estar a caminho): o app deve consultar de novo em instantes.
    pending: bool
    status: str | None = None  # 'active' | 'past_due' | 'canceled' | None (sem registro)
    expires_at: datetime | None = None
    product_id: str | None = None
    environment: str | None = None  # 'sandbox' | 'production'


class TeamBadge(BaseModel):
    trainer_name: str
    professional_type: str  # 'personal_trainer' | 'nutritionist'


class UserBadgesOut(BaseModel):
    is_pro: bool
    teams: list[TeamBadge]
