import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Squad(Base):
    __tablename__ = "squads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    # 6 caracteres, gerado na criacao (ver services/squad_invite.py) --
    # mecanismo de convite: o dono compartilha este codigo por qualquer
    # canal (Share.share ja existente em utils/invite.ts), quem recebe
    # digita em POST /squads/join. Sem deep link -- o app ainda nem tem
    # link de loja configurado em lugar nenhum.
    invite_code = Column(String(6), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SquadMembership(Base):
    """Ausencia de linha = usuario "Solo" (sem squad) -- nao usamos squad_id
    nullable pra representar isso. `user_id` com UNIQUE garante 1 squad
    ativo por vez (trocar de squad = UPDATE nesta mesma linha, sair = DELETE
    da linha), sem precisar de logica de aplicacao pra essa regra."""
    __tablename__ = "squad_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    squad_id = Column(UUID(as_uuid=True), ForeignKey("squads.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    joined_at = Column(DateTime, default=datetime.utcnow)
