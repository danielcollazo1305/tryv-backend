import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.subscription import CheckoutSessionOut
from app.services.stripe_client import get_client

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
logger = logging.getLogger(__name__)


def _get_or_create_stripe_customer(db: Session, client: stripe.StripeClient, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = client.customers.create({
        "email": user.email,
        "name": user.name,
        "metadata": {"user_id": str(user.id)},
    })
    user.stripe_customer_id = customer.id
    db.commit()
    return customer.id


@router.post("/pro/checkout", response_model=CheckoutSessionOut, status_code=status.HTTP_201_CREATED)
def checkout_pro(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cria uma Stripe Checkout Session (modo assinatura) para o Tryv Pro.
    Diferente da assinatura de professor: preco fixo (Price pre-criado no
    Stripe, nao montado na hora) e sem Stripe Connect — a receita e 100% da
    plataforma, sem split/application_fee.
    """
    existing = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == current_user.id,
            Subscription.type == "base",
            Subscription.status == "active",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voce ja tem uma assinatura Tryv Pro ativa",
        )

    if not settings.stripe_pro_price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Assinatura Tryv Pro ainda nao configurada",
        )

    client = get_client()

    try:
        customer_id = _get_or_create_stripe_customer(db, client, current_user)

        session = client.checkout.sessions.create({
            "mode": "subscription",
            "customer": customer_id,
            "client_reference_id": str(current_user.id),
            "line_items": [{"price": settings.stripe_pro_price_id, "quantity": 1}],
            "subscription_data": {
                "metadata": {"student_user_id": str(current_user.id)},
            },
            "metadata": {"student_user_id": str(current_user.id)},
            "success_url": (
                f"{settings.app_base_url}/subscriptions/pro/success"
                "?session_id={CHECKOUT_SESSION_ID}"
            ),
            "cancel_url": f"{settings.app_base_url}/subscriptions/pro/cancel",
        })
    except stripe.StripeError as e:
        logger.error("Falha ao criar checkout Tryv Pro (user_id=%s): %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nao foi possivel iniciar o checkout com o Stripe, tente novamente",
        )

    return CheckoutSessionOut(checkout_url=session.url)


@router.get("/pro/success")
def checkout_pro_success():
    return {"status": "success", "message": "Assinatura Tryv Pro confirmada! Voce ja pode fechar esta janela."}


@router.get("/pro/cancel")
def checkout_pro_cancel():
    return {"status": "canceled", "message": "Assinatura cancelada antes da conclusao do pagamento."}
