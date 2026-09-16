import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.user import (
    ForgotPasswordRequest,
    MessageOut,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services.email import send_email

router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger(__name__)

# Mensagem generica devolvida sempre pelo forgot-password, exista ou nao o
# e-mail -- nao da pra revelar quais e-mails tem conta (pratica basica de
# seguranca, ver docstring do endpoint abaixo).
_FORGOT_PASSWORD_MESSAGE = "Se esse e-mail estiver cadastrado, voce recebera um codigo de verificacao em instantes."
_RESET_CODE_EXPIRE_MINUTES = 15
_RESET_RATE_LIMIT_SECONDS = 60


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    user = User(
        name=user_data.name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return Token(access_token=access_token)


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Sempre devolve a mesma mensagem generica, exista ou nao o e-mail --
    do contrario a resposta vazaria quais e-mails tem conta cadastrada."""
    user = db.query(User).filter(User.email == payload.email).first()

    if user:
        now = datetime.utcnow()
        recent = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.created_at >= now - timedelta(seconds=_RESET_RATE_LIMIT_SECONDS),
            )
            .first()
        )
        # Rate limit basico: se ja pediu um codigo nos ultimos 60s, nao gera
        # nem envia outro (mas responde igual, pra nao vazar nada).
        if not recent:
            code = f"{secrets.randbelow(1_000_000):06d}"
            reset_token = PasswordResetToken(
                user_id=user.id,
                code=code,
                expires_at=now + timedelta(minutes=_RESET_CODE_EXPIRE_MINUTES),
            )
            db.add(reset_token)
            db.commit()

            sent = send_email(
                to=user.email,
                subject="Codigo de recuperacao de senha - Tryv Fit",
                html=(
                    f"<p>Ola, {user.name}!</p>"
                    f"<p>Use o codigo abaixo para redefinir sua senha no Tryv Fit. "
                    f"Ele e valido por {_RESET_CODE_EXPIRE_MINUTES} minutos.</p>"
                    f"<p style=\"font-size: 28px; font-weight: bold; letter-spacing: 4px;\">{code}</p>"
                    f"<p>Se voce nao pediu essa recuperacao, pode ignorar este e-mail.</p>"
                ),
            )
            if not sent:
                logger.warning(
                    "Codigo de recuperacao gerado para user_id=%s mas o e-mail nao foi entregue "
                    "(ver logs de app.services.email acima -- provavelmente limitacao do dominio "
                    "de teste do Resend).",
                    user.id,
                )

    return MessageOut(message=_FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", response_model=MessageOut)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    invalid_error = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo invalido ou expirado.")

    if not user:
        raise invalid_error

    reset_token = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.code == payload.code,
            PasswordResetToken.used.is_(False),
            PasswordResetToken.expires_at >= datetime.utcnow(),
        )
        .order_by(PasswordResetToken.created_at.desc())
        .first()
    )
    if not reset_token:
        raise invalid_error

    user.hashed_password = hash_password(payload.new_password)
    reset_token.used = True
    db.commit()

    return MessageOut(message="Senha redefinida com sucesso.")
