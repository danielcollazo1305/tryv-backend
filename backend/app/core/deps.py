import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.subscription import Subscription
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    raw_user_id = payload.get("sub")
    if raw_user_id is None:
        raise credentials_exception

    try:
        user_id = uuid.UUID(raw_user_id)
    except (ValueError, AttributeError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    return user


def pro_subscription_filter(now: datetime | None = None):
    """Condicao SQL de 'assinatura Tryv Pro valida agora' (type='base'), unica fonte da regra.
    - expires_at NULL (Stripe e linhas antigas): vale pelo status 'active', como sempre foi;
    - expires_at preenchido (compra no app): precisa estar no futuro;
    - 'past_due' so conta com expires_at no futuro: e a carencia de cobranca da Apple (no Stripe past_due nunca teve expires_at)."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    return and_(
        Subscription.type == "base",
        or_(
            and_(Subscription.status == "active", or_(Subscription.expires_at.is_(None), Subscription.expires_at > now)),
            and_(Subscription.status == "past_due", Subscription.expires_at.isnot(None), Subscription.expires_at > now),
        ),
    )


def has_active_pro_subscription(db: Session, user_id: uuid.UUID) -> bool:
    """
    Mesma checagem usada por require_pro_subscription, exposta como funcao
    pura (sem levantar HTTPException) pra endpoints que precisam se
    comportar diferente por usuario Pro/free em vez de bloquear o acesso
    inteiro — ex: POST /runs continua livre pra todo mundo, mas so calcula
    o campo new_prs (recordes pessoais) pra quem e Pro.
    """
    return (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, pro_subscription_filter())
        .first()
        is not None
    )


def require_pro_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Dependency reutilizavel pra qualquer endpoint que exija a assinatura
    Tryv Pro (type='base' em Subscription — nao confundir com a assinatura
    de professor, type='trainer_addon', que e independente disso).
    """
    if not has_active_pro_subscription(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Esta funcionalidade requer uma assinatura Tryv Fit Pro ativa",
        )
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency para endpoints restritos a administradores (User.is_admin). 403 para os demais."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    return current_user
