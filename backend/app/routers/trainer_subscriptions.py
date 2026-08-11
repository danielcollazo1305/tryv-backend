import logging
import uuid

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.common import StatusMessageOut
from app.schemas.subscription import CheckoutSessionOut
from app.services.stripe_client import get_client

router = APIRouter(tags=["trainer-subscriptions"])
logger = logging.getLogger(__name__)


def _get_subscribable_trainer(db: Session, trainer_id: str) -> Trainer:
    try:
        parsed_id = uuid.UUID(trainer_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    trainer = (
        db.query(Trainer)
        .filter(
            Trainer.id == parsed_id,
            Trainer.cref_verified.is_(True),
            Trainer.active.is_(True),
        )
        .first()
    )
    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")
    return trainer


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


@router.post(
    "/trainers/{trainer_id}/subscribe",
    response_model=CheckoutSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def subscribe_to_trainer(
    trainer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cria uma Stripe Checkout Session (modo assinatura) para o aluno logado
    assinar o plano do professor. O split de comissao e feito via
    destination charge: application_fee_percent fica retido pela
    plataforma, o restante e transferido automaticamente para a conta
    Connect do professor.
    """
    trainer = _get_subscribable_trainer(db, trainer_id)

    if not trainer.stripe_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este professor ainda nao concluiu o cadastro de pagamentos",
        )

    existing = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == current_user.id,
            Subscription.trainer_id == trainer.id,
            Subscription.type == "trainer_addon",
            Subscription.status == "active",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voce ja tem uma assinatura ativa com este professor",
        )

    client = get_client()

    try:
        customer_id = _get_or_create_stripe_customer(db, client, current_user)

        session = client.checkout.sessions.create({
            "mode": "subscription",
            "customer": customer_id,
            "client_reference_id": str(current_user.id),
            "line_items": [{
                "price_data": {
                    "currency": "brl",
                    "product_data": {"name": f"Assinatura Tryv - registro {trainer.license_number}"},
                    "unit_amount": round(trainer.price * 100),
                    "recurring": {"interval": "month"},
                },
                "quantity": 1,
            }],
            "subscription_data": {
                "application_fee_percent": trainer.platform_fee_percent,
                "transfer_data": {"destination": trainer.stripe_account_id},
                "metadata": {
                    "trainer_id": str(trainer.id),
                    "student_user_id": str(current_user.id),
                },
            },
            "metadata": {
                "trainer_id": str(trainer.id),
                "student_user_id": str(current_user.id),
            },
            "success_url": (
                f"{settings.app_base_url}/trainers/{trainer.id}/subscribe/success"
                "?session_id={CHECKOUT_SESSION_ID}"
            ),
            "cancel_url": f"{settings.app_base_url}/trainers/{trainer.id}/subscribe/cancel",
        })
    except stripe.StripeError as e:
        logger.error(
            "Falha ao criar checkout de assinatura (user_id=%s, trainer_id=%s): %s",
            current_user.id, trainer.id, e,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nao foi possivel iniciar o checkout com o Stripe, tente novamente",
        )

    return CheckoutSessionOut(checkout_url=session.url)


@router.get("/trainers/{trainer_id}/subscribe/success", response_model=StatusMessageOut)
def subscribe_success(trainer_id: str):
    return {"status": "success", "message": "Assinatura confirmada! Voce ja pode fechar esta janela."}


@router.get("/trainers/{trainer_id}/subscribe/cancel", response_model=StatusMessageOut)
def subscribe_cancel(trainer_id: str):
    return {"status": "canceled", "message": "Assinatura cancelada antes da conclusao do pagamento."}
