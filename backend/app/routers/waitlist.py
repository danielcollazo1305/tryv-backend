from fastapi import APIRouter, Depends, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.waitlist_email import WaitlistEmail
from app.schemas.waitlist import WaitlistSignupCreate, WaitlistSignupOut

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


@router.post("/", response_model=WaitlistSignupOut, status_code=status.HTTP_201_CREATED)
def join_waitlist(payload: WaitlistSignupCreate, db: Session = Depends(get_db)):
    """
    Endpoint publico (sem autenticacao) -- formulario da landing page de
    pre-lancamento. Sempre responde ok=true, inclusive pro honeypot
    preenchido e pro e-mail ja cadastrado: nao da pra um bot/scraper
    distinguir "capturado" de "bloqueado" pela resposta, e um usuario real
    que ja se cadastrou antes nao precisa ver erro nenhum por isso.
    """
    if payload.website:
        # Honeypot preenchido -- bot. Nao grava, responde sucesso mesmo
        # assim (nao da sinal nenhum pro bot de que foi identificado).
        return WaitlistSignupOut()

    try:
        db.add(WaitlistEmail(email=payload.email))
        db.commit()
    except IntegrityError:
        db.rollback()  # e-mail ja cadastrado -- ignora em silencio

    return WaitlistSignupOut()
