import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class WaitlistEmail(Base):
    """
    E-mail capturado na landing page de pre-lancamento (waitlist) -- sem
    vinculo com users, o app ainda nao esta nas lojas quando esse cadastro
    acontece. E-mail e unico (segundo cadastro do mesmo endereco e ignorado
    em silencio pelo router, nao gera erro pro usuario).
    """
    __tablename__ = "waitlist_emails"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
