import logging
import uuid

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.common import WebhookAckOut

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

_STRIPE_TO_INTERNAL_STATUS = {
    "active": "active",
    "trialing": "active",
    "past_due": "past_due",
    "unpaid": "past_due",
    "canceled": "canceled",
    "incomplete_expired": "canceled",
}


def _handle_checkout_completed(db: Session, session: dict) -> None:
    """
    Trata tanto o checkout do Tryv Pro (assinatura da plataforma) quanto o
    de professor (marketplace) — a metadata e quem diferencia: presenca de
    trainer_id = assinatura de professor; ausencia = Tryv Pro.
    """
    metadata = session.get("metadata") or {}
    trainer_id = metadata.get("trainer_id")
    student_user_id = metadata.get("student_user_id") or session.get("client_reference_id")
    stripe_subscription_id = session.get("subscription")

    if not (student_user_id and stripe_subscription_id):
        logger.error(
            "checkout.session.completed sem metadata esperada (session_id=%s)",
            session.get("id"),
        )
        return

    already_processed = (
        db.query(Subscription)
        .filter(Subscription.stripe_subscription_id == stripe_subscription_id)
        .first()
    )
    if already_processed:
        return  # Stripe pode reenviar o mesmo evento — idempotencia

    # Usuario (ou profissional) que ja nao existe -- ex.: a conta foi excluida entre o checkout e o webhook: IGNORA (200),
    # sem criar Subscription (a FK daria erro e o Stripe ficaria reenviando). So ids no log.
    try:
        parsed_user_id = uuid.UUID(str(student_user_id))
        parsed_trainer_id = uuid.UUID(str(trainer_id)) if trainer_id else None
    except ValueError:
        logger.warning("checkout.session.completed ignorado: id de usuario/profissional invalido na metadata")
        return
    if db.query(User.id).filter(User.id == parsed_user_id).first() is None:
        logger.warning("checkout.session.completed ignorado: usuario inexistente (user_id=%s)", parsed_user_id)
        return
    if parsed_trainer_id is not None and db.query(Trainer.id).filter(Trainer.id == parsed_trainer_id).first() is None:
        logger.warning("checkout.session.completed ignorado: profissional inexistente (trainer_id=%s)", parsed_trainer_id)
        return

    db.add(Subscription(
        user_id=parsed_user_id,
        type="trainer_addon" if trainer_id else "base",
        trainer_id=parsed_trainer_id,
        stripe_subscription_id=stripe_subscription_id,
        status="active",
    ))
    db.commit()


def _handle_subscription_status_change(db: Session, subscription: dict, *, deleted: bool = False) -> None:
    stripe_subscription_id = subscription.get("id")
    sub = (
        db.query(Subscription)
        .filter(Subscription.stripe_subscription_id == stripe_subscription_id)
        .first()
    )
    if not sub:
        logger.warning(
            "Evento de assinatura para stripe_subscription_id desconhecido: %s",
            stripe_subscription_id,
        )
        return

    if deleted:
        sub.status = "canceled"
    else:
        sub.status = _STRIPE_TO_INTERNAL_STATUS.get(subscription.get("status", ""), subscription.get("status"))

    db.commit()


@router.post("/stripe", response_model=WebhookAckOut)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError) as e:
        logger.error("Webhook Stripe rejeitado: %s", e)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload ou assinatura invalidos")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(db, data)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_status_change(db, data)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_status_change(db, data, deleted=True)

    return {"received": True}
