import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.schemas.common import WebhookAckOut
from app.services import revenuecat

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


def _revenuecat_secret_matches(authorization: str | None) -> bool:
    """Compara o header Authorization com o segredo compartilhado, em tempo constante. Aceita "<segredo>" ou "Bearer <segredo>"."""
    secret = settings.revenuecat_webhook_auth
    if not authorization or not secret:
        return False
    value = authorization.strip()
    if value.lower().startswith("bearer "):
        value = value[7:].strip()
    return hmac.compare_digest(value.encode("utf-8"), secret.encode("utf-8"))


@router.post("/revenuecat", response_model=WebhookAckOut)
async def revenuecat_webhook(
    request: Request,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """
    Webhook do RevenueCat (assinatura Pro por compra no app). Autenticado por segredo compartilhado (REVENUECAT_WEBHOOK_AUTH).
    Responde 2xx para tudo que foi recebido e entendido (inclusive evento repetido, de tipo ignorado ou de usuario inexistente),
    para o RevenueCat nao reenviar em loop; so 401/503/400/5xx fazem ele tentar de novo. Ver services/revenuecat.py.
    """
    if not settings.revenuecat_webhook_auth:
        logger.error("Webhook RevenueCat recebido, mas REVENUECAT_WEBHOOK_AUTH nao esta configurado")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook nao configurado")
    if not _revenuecat_secret_matches(authorization):
        logger.warning("Webhook RevenueCat rejeitado: segredo invalido")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nao autorizado")

    try:
        body = await request.json()
        event = body["event"]
        if not isinstance(event, dict):
            raise TypeError("event")
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload invalido")

    try:
        result = revenuecat.process_event(db, event)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload invalido")
    logger.info("revenuecat_event type=%s result=%s", event.get("type"), result)
    return {"received": True}
