import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Trainer(Base):
    __tablename__ = "trainers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)

    # 'personal_trainer' | 'nutritionist' — ver app/core/professional_types.py.
    # Usado tanto pro cadastro (o usuario escolhe) quanto pra restringir
    # funcionalidades especificas de personal trainer (ex: Live Activity,
    # Desafios).
    professional_type = Column(String, nullable=False, default="personal_trainer")

    # Numero de registro no conselho profissional — CREF pra personal
    # trainer, CRN pra nutricionista (o campo e generico, o significado
    # depende de professional_type). Renomeado de cref_number quando o
    # cadastro deixou de ser exclusivo de personal trainer.
    license_number = Column(String, nullable=False)
    cref_verified = Column(Boolean, default=False)

    bio = Column(Text, nullable=True)
    price = Column(Float, nullable=False)  # valor mensal cobrado do aluno
    active = Column(Boolean, default=True)

    # % de comissão da plataforma sobre esse professor (20% padrão, 12% se ativo em desafios)
    platform_fee_percent = Column(Float, default=20.0)

    stripe_account_id = Column(String, nullable=True)  # Stripe Connect account

    created_at = Column(DateTime, default=datetime.utcnow)
