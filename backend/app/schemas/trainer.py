import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TrainerRegister(BaseModel):
    cref_number: str
    bio: str | None = None
    price: float = Field(..., gt=0)


class TrainerUpdate(BaseModel):
    bio: str | None = None
    price: float | None = Field(None, gt=0)


class TrainerOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    cref_number: str
    cref_verified: bool
    bio: str | None = None
    price: float
    active: bool
    platform_fee_percent: float
    created_at: datetime

    class Config:
        from_attributes = True


class StripeOnboardingOut(BaseModel):
    onboarding_url: str


class StripeStatusOut(BaseModel):
    stripe_account_id: str | None = None
    details_submitted: bool = False
    charges_enabled: bool = False
    payouts_enabled: bool = False


class StudentOut(BaseModel):
    """Um aluno com assinatura ativa no professor logado — usado pela tela de Live Activity do professor."""
    user_id: uuid.UUID
    name: str
    is_live: bool
    live_activity_id: uuid.UUID | None = None
