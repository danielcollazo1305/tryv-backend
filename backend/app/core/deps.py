import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
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
        .filter(
            Subscription.user_id == user_id,
            Subscription.type == "base",
            Subscription.status == "active",
        )
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
