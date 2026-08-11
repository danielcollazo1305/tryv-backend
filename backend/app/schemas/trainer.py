import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.professional_types import validate_professional_type

_LICENSE_NUMBER_MAX_LENGTH = 50


def _clean_license_number(value: str) -> str:
    """
    Sanitizacao leve, sem validar formato (CREF/CRN variam de formato entre
    conselhos estaduais — nao ha uma fonte confiavel de todos os formatos
    oficiais pra validar sem risco de rejeitar registro valido). So trim,
    nao-vazio e um limite de tamanho razoavel. Decisao deliberada, nao
    esquecimento — pode ganhar validacao de formato depois.
    """
    value = value.strip()
    if not value:
        raise ValueError("license_number nao pode ser vazio")
    if len(value) > _LICENSE_NUMBER_MAX_LENGTH:
        raise ValueError(f"license_number muito longo (maximo {_LICENSE_NUMBER_MAX_LENGTH} caracteres)")
    return value


class TrainerRegister(BaseModel):
    professional_type: str
    license_number: str
    bio: str | None = None
    price: float = Field(..., gt=0)

    @field_validator("professional_type")
    @classmethod
    def _check_professional_type(cls, value: str) -> str:
        return validate_professional_type(value)

    @field_validator("license_number")
    @classmethod
    def _check_license_number(cls, value: str) -> str:
        return _clean_license_number(value)


class TrainerUpdate(BaseModel):
    bio: str | None = None
    price: float | None = Field(None, gt=0)


class TrainerOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    professional_type: str
    license_number: str
    cref_verified: bool
    bio: str | None = None
    price: float
    active: bool
    platform_fee_percent: float
    created_at: datetime

    class Config:
        from_attributes = True


class TrainerPublicOut(BaseModel):
    """Vitrine publica (GET /trainers/, GET /trainers/{id}) — sem
    platform_fee_percent: a comissao que a plataforma cobra do professor e
    um dado comercial interno, sem motivo pra aparecer numa rota sem
    autenticacao. TrainerOut (com esse campo) fica reservado pro proprio
    profissional ver o proprio perfil."""
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    professional_type: str
    license_number: str
    cref_verified: bool
    bio: str | None = None
    price: float
    active: bool
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
