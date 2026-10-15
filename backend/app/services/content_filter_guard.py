"""
Filtro de texto nos endpoints (E3e, fase 2): limites de tamanho, bloqueio, registro do evento e limite de tentativas.

Quem usa: os endpoints que gravam texto visivel a outras pessoas (post, comentario, cadastro/nome, clube, desafio,
profissional). A comparacao em si mora em core/content_filter.py; as listas, em app/content_filter/.

Contrato com o app (docs do E3e):
  - texto bloqueado  -> 422, `detail` em TEXTO (o app antigo ja o exibe), cabecalho `X-Content-Filter: text`, e a mensagem
    NUNCA traz o termo nem diz qual campo/palavra; nada e gravado, so o evento (sem texto, sem termo, sem IP);
  - pausa por excesso de tentativas bloqueadas -> 429 com `Retry-After` (+ o mesmo cabecalho);
  - texto grande demais -> 422 com mensagem em portugues (so conteudo NOVO; o antigo nao e tocado).
Logs: SO ids e categoria (ex.: content_filter_blocked kind=text surface=comment user_id=<uuid> category=hate).
"""
import logging
import math
import uuid
from datetime import timedelta
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core import timezone as tz
from app.core.content_filter import CATEGORIES, check_text
from app.core.content_filter_throttle import DAILY_LIMIT, ip_throttle, pause_end_from_timestamps
from app.models.content_filter_event import ContentFilterEvent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------------------------------------------
# MENSAGENS (revisar com o dono). A de autolesao/transtorno alimentar traz o CVV (188).
# ---------------------------------------------------------------------------------------------------------------
TEXT_BLOCKED_MESSAGE = "Seu texto contém linguagem que não é permitida no Tryv. Reescreva para publicar."
NAME_BLOCKED_MESSAGE = "Escolha outro nome."
SELFHARM_MESSAGE = (
    "Seu texto não foi publicado. Se você está passando por um momento difícil, o CVV atende 24 horas, de graça, "
    "pelo 188. Você não precisa passar por isso sozinho."
)

FILTER_HEADER = "X-Content-Filter"
FILTER_HEADER_VALUE = "text"

# ---------------------------------------------------------------------------------------------------------------
# LIMITES DE TAMANHO (caracteres). Legenda, comentario e nome vieram da decisao do dono; os demais sao tetos de seguranca.
# ---------------------------------------------------------------------------------------------------------------
CAPTION_MAX = 1000
COMMENT_MAX = 500
NAME_MAX = 60
CHALLENGE_TITLE_MAX = 120
CHALLENGE_DESCRIPTION_MAX = 5000
CHALLENGE_UNIT_MAX = 60
BIO_MAX = 5000
CERTIFICATIONS_MAX = 5000

_SURFACE_LABELS = {
    "post_caption": "A legenda",
    "comment": "O comentário",
    "name": "O nome",
    "squad_name": "O nome do clube",
    "challenge_title": "O título do desafio",
    "challenge_description": "A descrição do desafio",
    "challenge_target_unit": "A unidade da meta",
    "trainer_bio": "A bio",
    "trainer_certifications": "O campo de certificações",
}


def _format_count(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def ensure_max_length(text: str | None, max_chars: int, surface: str) -> None:
    """422 em portugues se o texto passar do limite. Vale so para conteudo novo."""
    if text is not None and len(text) > max_chars:
        label = _SURFACE_LABELS.get(surface, "O texto")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} pode ter no máximo {_format_count(max_chars)} caracteres.",
        )


def _message_for(surface: str, category: str) -> str:
    if category == "selfharm":
        return SELFHARM_MESSAGE
    if surface == "name":
        return NAME_BLOCKED_MESSAGE
    return TEXT_BLOCKED_MESSAGE


def _pause_text(seconds: int) -> str:
    minutes = max(1, math.ceil(seconds / 60))
    if minutes >= 120:
        hours = math.ceil(minutes / 60)
        return f"{hours} horas"
    return f"{minutes} minuto" + ("" if minutes == 1 else "s")


def _user_pause_seconds(db: Session, user_id: uuid.UUID) -> int:
    now = tz.utc_now()
    rows = (
        db.query(ContentFilterEvent.created_at)
        .filter(ContentFilterEvent.user_id == user_id, ContentFilterEvent.created_at > now - timedelta(hours=24))
        .order_by(ContentFilterEvent.created_at.desc())
        .limit(DAILY_LIMIT)
        .all()
    )
    end = pause_end_from_timestamps([r[0] for r in rows], now)
    if end is None:
        return 0
    return max(1, int((end - now).total_seconds() + 0.999))


def _raise_paused(surface_hint: str, user_id, seconds: int) -> None:
    logger.warning("content_filter_paused kind=text user_id=%s retry_after=%s", user_id or "-", seconds)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Muitas tentativas bloqueadas. Tente novamente em {_pause_text(seconds)}.",
        headers={"Retry-After": str(seconds), FILTER_HEADER: FILTER_HEADER_VALUE},
    )


def enforce_text_filter(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    fields: Iterable[tuple[str, str | None]],
    ip: str | None = None,
) -> None:
    """Confere os campos de texto de UMA requisicao. `fields` = [(surface, texto), ...].

    1) Pausa por excesso de bloqueios (por usuario, pelos eventos no banco; sem usuario, por IP em memoria): 429. Durante a
       pausa NADA e registrado, entao a pausa nao e prolongada.
    2) Filtro: se algum texto cair em uma categoria, grava o evento (sem texto) e responde 422.
    """
    fields = list(fields)
    seconds = _user_pause_seconds(db, user_id) if user_id is not None else (ip_throttle.pause_remaining_seconds(ip) if ip else 0)
    if seconds:
        _raise_paused("", user_id, seconds)

    hit_surface = hit_category = None
    for surface, text in fields:
        category = check_text(text)
        if category and (hit_category is None or CATEGORIES.index(category) < CATEGORIES.index(hit_category)):
            hit_surface, hit_category = surface, category
    if hit_category is None:
        return

    if user_id is None and ip:
        ip_throttle.record(ip)
    try:
        db.add(ContentFilterEvent(user_id=user_id, surface=hit_surface, category=hit_category, created_at=tz.utc_now()))
        db.commit()
    except Exception as error:  # noqa: BLE001 -- registrar o evento nunca pode impedir a resposta ao usuario
        db.rollback()
        logger.error("content_filter_event_failed user_id=%s (%s)", user_id or "-", type(error).__name__)
    logger.warning(
        "content_filter_blocked kind=text surface=%s user_id=%s category=%s", hit_surface, user_id or "-", hit_category
    )
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=_message_for(hit_surface, hit_category),
        headers={FILTER_HEADER: FILTER_HEADER_VALUE},
    )
