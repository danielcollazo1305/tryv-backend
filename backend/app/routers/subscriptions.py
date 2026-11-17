import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, has_active_pro_subscription
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.subscription import IapSyncOut

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
logger = logging.getLogger(__name__)


@router.post("/iap/sync", response_model=IapSyncOut)
def sync_iap_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    O app chama depois de uma compra ou de "Restaurar compras". NAO recebe nada do app: o desenho mais seguro e nao confiar em
    nenhum dado vindo do cliente (recibo, "sou Pro", datas), porque o cliente pode ser adulterado. O estado vem so do webhook
    autenticado do RevenueCat (POST /webhooks/revenuecat), que ja gravou a assinatura deste usuario; aqui apenas se le e se
    devolve, aplicando a mesma regra de acesso (expires_at no futuro, carencia) do resto da API. Idempotente e sem efeito colateral.
    Se ainda nao ha registro (webhook a caminho), devolve pending=true e o app consulta de novo em alguns segundos.
    """
    sub = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == current_user.id,
            Subscription.provider == "revenuecat",
            Subscription.type == "base",
        )
        .first()
    )
    is_pro = has_active_pro_subscription(db, current_user.id)
    return IapSyncOut(
        is_pro=is_pro,
        pending=sub is None and not is_pro,
        status=sub.status if sub else None,
        expires_at=sub.expires_at if sub else None,
        product_id=sub.product_id if sub else None,
        environment=sub.environment if sub else None,
    )
