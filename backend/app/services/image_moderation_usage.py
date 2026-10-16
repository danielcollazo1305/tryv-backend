"""
Teto GLOBAL diario de gasto com a analise automatica de fotos (E3e): conta cada CHAMADA a IA do dia e, passando do teto, FALHA FECHADA.

  - Dia = America/Sao_Paulo (core.timezone.local_today, o mesmo "dia local" do resto do projeto).
  - Contador no banco (tabela image_moderation_usage), atualizado por UPSERT atomico com a checagem do teto dentro do proprio
    comando: com varios processos/replicas a contagem NUNCA passa do teto (margem zero para as vagas reservadas).
  - Cada chamada a IA reserva UMA vaga ANTES de ser feita (inclusive a nova tentativa depois de um timeout). Uma vaga reservada e
    gasta mesmo que a chamada falhe (conservador: pode contar a mais do que a Anthropic cobrou, nunca a menos). Upload recusado antes da
    IA (limite por hora, pausa, arquivo ilegivel, sem chave, modo simulado) NAO reserva vaga.
  - Passou do teto -> ImageModerationCapReached: o upload responde 503 com mensagem propria, sem chamar a IA, sem gravar nada e sem
    registrar evento de bloqueio contra a pessoa. Posts so de texto nao passam por aqui.
  - Alertas no log (WARNING), UMA linha por dia e por nivel, so com contagens: ao atingir IMAGE_MODERATION_ALERT_RATIO do teto e ao
    atingir o teto.

CONFIGURACAO (variaveis de ambiente):
  IMAGE_MODERATION_DAILY_CAP    numero de chamadas por dia. Ausente, vazio, nao numerico ou negativo -> PADRAO (DEFAULT_DAILY_CAP).
                                0 NUNCA significa "sem teto": significa "analise desligada" (toda foto de post falha fechada com a
                                mensagem do teto). Para praticamente liberar, defina um numero grande de proposito.
  IMAGE_MODERATION_ALERT_RATIO  fracao do teto que dispara o alerta, entre 0 e 1 (padrao 0.8). Invalido -> padrao.
"""
import logging
import math
from datetime import date

from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.timezone import local_today

logger = logging.getLogger(__name__)

# Conta do padrao: cada upload de foto de post = 1 chamada (2 se houver nova tentativa). Medido: ~3.800 tokens de entrada e ~105 de
# saida por chamada; com um preco hipotetico de US$ 3/15 por milhao, 300 chamadas ~ US$ 3,9 por dia (~ US$ 116 por mes no pior caso).
DEFAULT_DAILY_CAP = 300
DEFAULT_ALERT_RATIO = 0.8


class ImageModerationCapReached(Exception):
    """O teto diario de chamadas a IA foi atingido (ou a analise esta desligada com teto 0): falha fechada, sem chamar a IA."""


def daily_cap() -> int:
    raw = str(settings.image_moderation_daily_cap or "").strip()
    if not raw:
        return DEFAULT_DAILY_CAP
    try:
        value = int(raw)
    except ValueError:
        logger.warning("image_moderation_daily_cap_invalid usando_padrao=%s", DEFAULT_DAILY_CAP)
        return DEFAULT_DAILY_CAP
    if value < 0:
        logger.warning("image_moderation_daily_cap_invalid usando_padrao=%s", DEFAULT_DAILY_CAP)
        return DEFAULT_DAILY_CAP
    return value


def alert_ratio() -> float:
    raw = str(settings.image_moderation_alert_ratio or "").strip()
    try:
        value = float(raw) if raw else DEFAULT_ALERT_RATIO
    except ValueError:
        return DEFAULT_ALERT_RATIO
    return value if 0 < value <= 1 else DEFAULT_ALERT_RATIO


_RESERVE_SQL = text(
    """
    INSERT INTO image_moderation_usage (day, calls) VALUES (:day, 1)
    ON CONFLICT (day) DO UPDATE SET calls = image_moderation_usage.calls + 1
    WHERE image_moderation_usage.calls < :cap
    RETURNING calls
    """
)


def _log_level_once(session, day: date, column: str, level: str, calls: int, cap: int) -> None:
    """Grava a marca (alerta/teto) e loga UMA vez por dia: so quem virou a marca de falsa para verdadeira loga."""
    flipped = session.execute(
        text(f"UPDATE image_moderation_usage SET {column} = TRUE WHERE day = :day AND {column} = FALSE"), {"day": day}
    ).rowcount
    session.commit()
    if flipped:
        logger.warning("image_moderation_daily_%s day=%s calls=%s cap=%s", level, day.isoformat(), calls, cap)


def reserve_call() -> int:
    """Reserva UMA chamada a IA no teto de hoje; devolve o total do dia depois de reservar. Levanta ImageModerationCapReached."""
    cap = daily_cap()
    day = local_today()
    if cap <= 0:
        raise ImageModerationCapReached("analise desligada (teto 0)")
    with SessionLocal() as session:
        calls = session.execute(_RESERVE_SQL, {"day": day, "cap": cap}).scalar()
        session.commit()
        if calls is None:
            # teto ja atingido hoje (ex.: o teto foi reduzido no meio do dia): garante o aviso do nivel "cap" uma vez
            _log_level_once(session, day, "cap_logged", "cap", cap, cap)
            raise ImageModerationCapReached("teto diario atingido")
        if calls >= max(1, math.ceil(cap * alert_ratio())):
            _log_level_once(session, day, "alert_logged", "alert", calls, cap)
        if calls >= cap:
            _log_level_once(session, day, "cap_logged", "cap", calls, cap)
        return calls
