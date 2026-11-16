"""
Registro de uso da IA e teto diario por usuario.

  - record_ai_usage(): grava UMA linha em ai_usage por chamada a IA (usuario, funcionalidade, modelo, tokens de entrada e de saida).
    SO NUMEROS: nunca o prompt, a resposta, nomes de arquivo ou qualquer texto do usuario. Melhor esforco: uma falha ao gravar so vai para o
    log (WARNING) e NUNCA derruba a funcionalidade que acabou de funcionar. Abre a propria sessao (os servicos de IA nao recebem `db`), como
    services/image_moderation_usage.py.
  - enforce_daily_cap(): teto diario POR USUARIO, contado em banco (linhas de hoje em ai_usage para a funcionalidade), no padrao de
    AvatarAttempt. Passou do teto -> 429 em portugues com Retry-After ate a meia-noite local. Sem lock: duas requisicoes simultaneas podem
    passar juntas e estourar o teto por 1 (aceito, como no avatar).

CONFIGURACAO: AI_INSIGHT_DAILY_LIMIT (settings.ai_insight_daily_limit), texto de proposito: ausente, vazio, nao numerico ou negativo ->
AI_INSIGHT_DAILY_LIMIT_DEFAULT; 0 = geracao desligada (NUNCA "sem teto"). Para praticamente liberar, defina um numero grande de proposito.
"""
import logging
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.timezone import local_day_bounds, local_today
from app.models.ai_usage import AiUsage

logger = logging.getLogger(__name__)

# Padrao generoso: um usuario real gera 1 insight por dia (o app chama /generate ao abrir o card); 20 cobre muitas regeneracoes sem
# permitir gasto ilimitado.
AI_INSIGHT_DAILY_LIMIT_DEFAULT = 20

FEATURE_MEAL_PHOTO = "meal_photo"
FEATURE_MEAL_TEXT = "meal_text"
FEATURE_WORKOUT_PLAN = "workout_plan"
FEATURE_DAILY_INSIGHT = "daily_insight"
FEATURE_ACTIVITY_INSIGHT = "activity_insight"


def _token_count(usage: object, name: str) -> int:
    value = getattr(usage, name, 0)
    return value if isinstance(value, int) and value >= 0 else 0


def record_ai_usage(user_id: uuid.UUID | None, feature: str, model: str, response: object) -> None:
    """Grava os tokens da `response` (anthropic Message: response.usage.input_tokens/output_tokens). Sem usuario = nao grava. Nunca lanca."""
    if user_id is None:
        return
    try:
        usage = getattr(response, "usage", None)
        with SessionLocal() as session:
            session.add(
                AiUsage(
                    user_id=user_id,
                    feature=feature,
                    model=model,
                    input_tokens=_token_count(usage, "input_tokens"),
                    output_tokens=_token_count(usage, "output_tokens"),
                )
            )
            session.commit()
    except Exception as exc:  # noqa: BLE001 - registrar uso nunca pode quebrar a funcionalidade
        logger.warning("ai_usage_record_failed feature=%s error=%s", feature, type(exc).__name__)


def insight_daily_limit() -> int:
    raw = str(settings.ai_insight_daily_limit or "").strip()
    if not raw:
        return AI_INSIGHT_DAILY_LIMIT_DEFAULT
    try:
        value = int(raw)
    except ValueError:
        logger.warning("ai_insight_daily_limit_invalid usando_padrao=%s", AI_INSIGHT_DAILY_LIMIT_DEFAULT)
        return AI_INSIGHT_DAILY_LIMIT_DEFAULT
    if value < 0:
        logger.warning("ai_insight_daily_limit_invalid usando_padrao=%s", AI_INSIGHT_DAILY_LIMIT_DEFAULT)
        return AI_INSIGHT_DAILY_LIMIT_DEFAULT
    return value


def calls_today(db: Session, user_id: uuid.UUID, feature: str) -> int:
    """Chamadas do usuario hoje (dia LOCAL) para a funcionalidade, a partir de ai_usage."""
    start, end = local_day_bounds(local_today())
    return (
        db.query(func.count(AiUsage.id))
        .filter(AiUsage.user_id == user_id, AiUsage.feature == feature, AiUsage.created_at >= start, AiUsage.created_at < end)
        .scalar()
        or 0
    )


def enforce_insight_daily_cap(db: Session, user_id: uuid.UUID) -> None:
    """429 (em portugues, com Retry-After) se o usuario ja gerou o maximo de insights hoje; senao nao faz nada."""
    limit = insight_daily_limit()
    if calls_today(db, user_id, FEATURE_DAILY_INSIGHT) < limit:
        return
    _, end = local_day_bounds(local_today())
    retry_after = max(1, int((end - datetime.utcnow()).total_seconds()))
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Você atingiu o limite diário de insights gerados. Tente novamente amanhã.",
        headers={"Retry-After": str(retry_after)},
    )
