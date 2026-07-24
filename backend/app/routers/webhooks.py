import logging
import uuid

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.subscription import Subscription

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
    metadata = session.get("metadata") or {}
    trainer_id = metadata.get("trainer_id")
    student_user_id = metadata.get("student_user_id") or session.get("client_reference_id")
    stripe_subscription_id = session.get("subscription")

    if not (trainer_id and student_user_id and stripe_subscription_id):
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

    db.add(Subscription(
        user_id=uuid.UUID(student_user_id),
        type="trainer_addon",
        trainer_id=uuid.UUID(trainer_id),
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


@router.post("/stripe")
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
