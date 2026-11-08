"""Assinatura Pro por compra dentro do app (Apple IAP), via webhook do RevenueCat.

O RevenueCat e a fonte da verdade do estado da assinatura; o Tryv guarda uma copia em `subscriptions` (provider='revenuecat',
type='base'), atualizada SO por eventos de webhook autenticados (routers/webhooks.py). O app nunca informa "sou Pro": o
POST /subscriptions/iap/sync apenas devolve o que o webhook ja registrou. Nada aqui chama a rede.

Mapeamento do app_user_id: o app faz `Purchases.logIn(<id do usuario no Tryv>)`, entao app_user_id == users.id (UUID). Ids anonimos
("$RCAnonymousID:...") nao tem dono conhecido e sao ignorados (o RevenueCat reenvia com o id real depois do logIn, via alias).
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.subscription import Subscription, SubscriptionWebhookEvent
from app.models.user import User

logger = logging.getLogger(__name__)

PROVIDER = "revenuecat"

# Eventos que (re)concedem o acesso ate expiration_at_ms.
_GRANT_EVENTS = frozenset(
    {
        "INITIAL_PURCHASE",
        "RENEWAL",
        "UNCANCELLATION",
        "PRODUCT_CHANGE",
        "TEMPORARY_ENTITLEMENT_GRANT",
        "SUBSCRIPTION_EXTENDED",
    }
)
_HANDLED_EVENTS = _GRANT_EVENTS | {"CANCELLATION", "EXPIRATION", "BILLING_ISSUE"}
# Cancelamento por reembolso (estorno): o acesso acaba na hora. Os demais motivos (UNSUBSCRIBE, BILLING_ERROR, PRICE_INCREASE,
# DEVELOPER_INITIATED, UNKNOWN) so desligam a renovacao: o acesso vale ate expiration_at_ms.
_REFUND_CANCEL_REASONS = frozenset({"CUSTOMER_SUPPORT"})


def utcnow() -> datetime:
    """UTC naive (o banco guarda instantes em timestamp sem fuso; ver core/database.py)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _from_ms(value) -> datetime | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).replace(tzinfo=None)
    except (OverflowError, OSError, ValueError):
        return None


def _parse_uuid(value) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _resolve_user_id(db: Session, event: dict) -> uuid.UUID | None:
    """Primeiro candidato (app_user_id, original_app_user_id, aliases) que e UUID de um usuario existente."""
    candidates = [event.get("app_user_id"), event.get("original_app_user_id")]
    aliases = event.get("aliases")
    if isinstance(aliases, list):
        candidates.extend(aliases)
    seen: set[uuid.UUID] = set()
    for raw in candidates:
        parsed = _parse_uuid(raw)
        if parsed is None or parsed in seen:
            continue
        seen.add(parsed)
        if db.query(User.id).filter(User.id == parsed).first() is not None:
            return parsed
    return None


def _is_pro_entitlement(event: dict) -> bool:
    wanted = settings.revenuecat_pro_entitlement
    ids = event.get("entitlement_ids")
    if isinstance(ids, list) and wanted in ids:
        return True
    return event.get("entitlement_id") == wanted


def _next_state(event_type: str, event: dict, now: datetime) -> tuple[str, datetime | None, str | None] | None:
    """(status, expires_at, product_id) que o evento define, ou None se faltar dado para decidir com seguranca."""
    expiration = _from_ms(event.get("expiration_at_ms"))
    product_id = event.get("product_id")

    if event_type in _GRANT_EVENTS:
        if expiration is None:
            return None  # sem data de fim nao se concede acesso
        if event_type == "PRODUCT_CHANGE" and event.get("new_product_id"):
            product_id = event["new_product_id"]
        return ("active" if expiration > now else "canceled", expiration, product_id)

    if event_type == "CANCELLATION":
        if event.get("cancel_reason") in _REFUND_CANCEL_REASONS:
            return ("canceled", min(expiration, now) if expiration else now, product_id)
        if expiration is None:
            return None
        return ("active" if expiration > now else "canceled", expiration, product_id)

    if event_type == "EXPIRATION":
        return ("canceled", expiration or now, product_id)

    if event_type == "BILLING_ISSUE":
        # Carencia de cobranca da Apple: o acesso segue ate grace_period_expiration_at_ms. Sem carencia, nao ha acesso extra.
        grace = _from_ms(event.get("grace_period_expiration_at_ms")) or expiration
        if grace is None:
            return None
        return ("past_due", grace, product_id)

    return None


def _upsert(db: Session, user_id: uuid.UUID, event: dict, state, event_at: datetime) -> bool:
    """Aplica o estado na linha unica (user, revenuecat, base). False se o evento e mais antigo que o ultimo aplicado."""
    status, expires_at, product_id = state
    environment = "sandbox" if str(event.get("environment", "")).upper() == "SANDBOX" else "production"
    sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, Subscription.provider == PROVIDER, Subscription.type == "base")
        .with_for_update()
        .first()
    )
    if sub is None:
        sub = Subscription(user_id=user_id, type="base", provider=PROVIDER)
        db.add(sub)
    elif sub.last_event_at is not None and event_at < sub.last_event_at:
        return False  # evento antigo chegando depois de um mais novo: nao desfaz o estado atual
    sub.status = status
    sub.expires_at = expires_at
    sub.product_id = product_id
    sub.environment = environment
    sub.provider_customer_id = str(event.get("app_user_id") or user_id)
    sub.last_event_at = event_at
    return True


def process_event(db: Session, event: dict) -> str:
    """Aplica um evento do RevenueCat. Devolve o que aconteceu (so para log/teste):
    'applied' | 'stale' | 'duplicate' | 'ignored_type' | 'ignored_user' | 'ignored_entitlement' | 'ignored_incomplete'.
    Idempotente por event['id']. O registro do evento e a mudanca na assinatura vao no MESMO commit (se algo falha, nada fica
    gravado e o reenvio do RevenueCat reaplica)."""
    event_id = event.get("id")
    event_type = str(event.get("type", ""))
    if not isinstance(event_id, str) or not event_id:
        raise ValueError("evento sem id")

    if db.get(SubscriptionWebhookEvent, event_id) is not None:
        return "duplicate"
    if event_type not in _HANDLED_EVENTS:
        return "ignored_type"  # TEST, TRANSFER, NON_RENEWING_PURCHASE etc.: so confirma o recebimento

    user_id = _resolve_user_id(db, event)
    if user_id is None:
        logger.warning("revenuecat_event_ignored reason=user_not_found event_type=%s", event_type)
        return "ignored_user"
    if not _is_pro_entitlement(event):
        return "ignored_entitlement"

    now = utcnow()
    state = _next_state(event_type, event, now)
    event_at = _from_ms(event.get("event_timestamp_ms")) or now
    if state is None:
        logger.warning("revenuecat_event_ignored reason=incomplete event_type=%s", event_type)
        return "ignored_incomplete"

    for attempt in (1, 2):
        try:
            applied = _upsert(db, user_id, event, state, event_at)
            db.add(SubscriptionWebhookEvent(event_id=event_id, provider=PROVIDER, event_type=event_type))
            db.commit()
            return "applied" if applied else "stale"
        except IntegrityError:
            # Corrida: outro worker gravou o mesmo evento ou criou a assinatura do usuario ao mesmo tempo.
            db.rollback()
            if db.get(SubscriptionWebhookEvent, event_id) is not None:
                return "duplicate"
            if attempt == 2:
                raise
    raise RuntimeError("inalcancavel")
