"""Geracao do codigo de convite de squad (ver models/squad.py::Squad.invite_code)."""
import secrets

from sqlalchemy.orm import Session

from app.models.squad import Squad

# Sem 0/O e 1/I/L (ambiguos ao ler/digitar um codigo repassado por
# WhatsApp/audio) -- ~31^6 combinacoes, suficiente pra evitar colisao com
# poucas tentativas mesmo com muitos squads.
_INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_INVITE_CODE_LENGTH = 6
_MAX_ATTEMPTS = 10


def generate_unique_invite_code(db: Session) -> str:
    for _ in range(_MAX_ATTEMPTS):
        code = "".join(secrets.choice(_INVITE_CODE_ALPHABET) for _ in range(_INVITE_CODE_LENGTH))
        exists = db.query(Squad.id).filter(Squad.invite_code == code).first()
        if not exists:
            return code
    raise RuntimeError("Nao foi possivel gerar um codigo de convite unico")
