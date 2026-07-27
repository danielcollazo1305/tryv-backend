import logging
import uuid

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.trainer import (
    StripeOnboardingOut,
    StripeStatusOut,
    TrainerOut,
    TrainerRegister,
    TrainerUpdate,
)
from app.services.stripe_client import get_client

router = APIRouter(prefix="/trainers", tags=["trainers"])
logger = logging.getLogger(__name__)

# Placeholder ate existir um app/web real para o professor voltar depois do
# onboarding hospedado pelo Stripe. O Stripe exige URLs validas aqui, mas so
# usa refresh_url/return_url para redirecionar o navegador do professor.
_STRIPE_ONBOARDING_REFRESH_URL = "https://tryv.app/trainer/stripe-onboarding/refresh"
_STRIPE_ONBOARDING_RETURN_URL = "https://tryv.app/trainer/stripe-onboarding/return"


def _get_my_trainer(db: Session, current_user: User) -> Trainer:
    trainer = db.query(Trainer).filter(Trainer.user_id == current_user.id).first()
    if not trainer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao esta cadastrado como professor",
        )
    return trainer


def _to_trainer_out(db: Session, trainer: Trainer, user_name: str | None = None) -> TrainerOut:
    """TrainerOut inclui user_name, que nao existe na tabela trainers — busca
    (ou reaproveita, se ja veio de um join) o nome do usuario associado."""
    if user_name is None:
        user_name = db.query(User.name).filter(User.id == trainer.user_id).scalar() or ""
    return TrainerOut(
        id=trainer.id,
        user_id=trainer.user_id,
        user_name=user_name,
        cref_number=trainer.cref_number,
        cref_verified=trainer.cref_verified,
        bio=trainer.bio,
        price=trainer.price,
        active=trainer.active,
        platform_fee_percent=trainer.platform_fee_percent,
        created_at=trainer.created_at,
    )


@router.post("/register", response_model=TrainerOut, status_code=status.HTTP_201_CREATED)
def register(
    payload: TrainerRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Trainer).filter(Trainer.user_id == current_user.id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario ja esta cadastrado como professor",
        )

    trainer = Trainer(
        user_id=current_user.id,
        cref_number=payload.cref_number,
        bio=payload.bio,
        price=payload.price,
    )
    db.add(trainer)
    db.commit()
    db.refresh(trainer)
    return _to_trainer_out(db, trainer, user_name=current_user.name)


@router.get("/me", response_model=TrainerOut)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = _get_my_trainer(db, current_user)
    return _to_trainer_out(db, trainer, user_name=current_user.name)


@router.patch("/me", response_model=TrainerOut)
def update_my_profile(
    payload: TrainerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = _get_my_trainer(db, current_user)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(trainer, field, value)

    db.commit()
    db.refresh(trainer)
    return _to_trainer_out(db, trainer, user_name=current_user.name)


@router.post("/me/stripe-onboarding", response_model=StripeOnboardingOut, status_code=status.HTTP_201_CREATED)
def create_stripe_onboarding_link(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cria (se ainda nao existir) a conta Stripe Connect Express do professor
    e retorna o link de onboarding hospedado pelo Stripe — o backend nunca
    coleta dados bancarios/documentos diretamente.
    """
    trainer = _get_my_trainer(db, current_user)
    client = get_client()

    try:
        if not trainer.stripe_account_id:
            account = client.accounts.create({
                "type": "express",
                "email": current_user.email,
                "capabilities": {
                    "card_payments": {"requested": True},
                    "transfers": {"requested": True},
                },
            })
            trainer.stripe_account_id = account.id
            db.commit()

        account_link = client.account_links.create({
            "account": trainer.stripe_account_id,
            "refresh_url": _STRIPE_ONBOARDING_REFRESH_URL,
            "return_url": _STRIPE_ONBOARDING_RETURN_URL,
            "type": "account_onboarding",
        })
    except stripe.StripeError as e:
        logger.error("Falha ao criar onboarding Stripe (trainer_id=%s): %s", trainer.id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nao foi possivel iniciar o onboarding com o Stripe, tente novamente",
        )

    return StripeOnboardingOut(onboarding_url=account_link.url)


@router.get("/me/stripe-status", response_model=StripeStatusOut)
def get_stripe_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = _get_my_trainer(db, current_user)

    if not trainer.stripe_account_id:
        return StripeStatusOut(stripe_account_id=None)

    try:
        account = get_client().accounts.retrieve(trainer.stripe_account_id)
    except stripe.StripeError as e:
        logger.error("Falha ao consultar status Stripe (trainer_id=%s): %s", trainer.id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nao foi possivel consultar o status da conta Stripe, tente novamente",
        )

    return StripeStatusOut(
        stripe_account_id=account.id,
        details_submitted=bool(account.details_submitted),
        charges_enabled=bool(account.charges_enabled),
        payouts_enabled=bool(account.payouts_enabled),
    )


@router.get("/", response_model=list[TrainerOut])
def list_trainers(db: Session = Depends(get_db)):
    """Lista publica — so professores verificados e ativos aparecem na busca."""
    rows = (
        db.query(Trainer, User.name)
        .join(User, Trainer.user_id == User.id)
        .filter(Trainer.cref_verified.is_(True), Trainer.active.is_(True))
        .order_by(Trainer.created_at.desc())
        .all()
    )
    return [_to_trainer_out(db, trainer, user_name=user_name) for trainer, user_name in rows]


@router.get("/{trainer_id}", response_model=TrainerOut)
def get_trainer(trainer_id: str, db: Session = Depends(get_db)):
    """Perfil publico de um professor — mesma regra da lista: so verificado e ativo."""
    try:
        parsed_id = uuid.UUID(trainer_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    row = (
        db.query(Trainer, User.name)
        .join(User, Trainer.user_id == User.id)
        .filter(
            Trainer.id == parsed_id,
            Trainer.cref_verified.is_(True),
            Trainer.active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")
    trainer, user_name = row
    return _to_trainer_out(db, trainer, user_name=user_name)


@router.patch("/{trainer_id}/verify", response_model=TrainerOut)
def verify_trainer(
    trainer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aprovacao manual de CREF — restrita a administradores (User.is_admin)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")

    try:
        parsed_id = uuid.UUID(trainer_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    trainer = db.query(Trainer).filter(Trainer.id == parsed_id).first()
    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    trainer.cref_verified = True
    db.commit()
    db.refresh(trainer)
    return _to_trainer_out(db, trainer)
