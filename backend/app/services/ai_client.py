"""
Cliente Claude compartilhado entre os servicos que fazem chamadas a API
(analise de refeicoes, geracao de plano de treino, insights).
"""
import logging

import anthropic
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-opus-4-8"

# Modelo mais barato usado pelas chamadas de baixo risco (insights curtos a
# partir de dados ja agregados: daily_insight.py, activity_insight.py), que
# passam isso explicitamente na chamada. meal_analysis.py e
# workout_generator.py continuam usando MODEL (Opus) por padrao, sem
# precisar mudar nada.
LIGHT_MODEL = "claude-sonnet-5"

# ---------------------------------------------------------------------------------------------------------------
# Limites de rede POR FUNCAO. Antes valiam os padroes do SDK (10 min de timeout e 2 retentativas: uma chamada travada podia prender uma thread
# do servidor por mais de 30 min); depois um timeout unico de 60 s, que e curto para as chamadas longas. Padroes e o raciocinio de cada um:
#
#   insight (60 s): Sonnet, saida curta (max_tokens 1024) a partir de dados ja agregados. Costuma levar poucos segundos; 60 s e margem larga
#     e ainda libera a thread rapido se a Anthropic travar.
#   refeicao (90 s): Opus com FOTO em base64 (upload + visao) e raciocinio adaptativo, max_tokens 4096. E mais lenta e mais variavel que um
#     insight; 90 s cobre a cauda lenta sem prender a thread por minutos.
#   plano de treino (180 s): Opus com raciocinio adaptativo e saida estruturada grande (max_tokens 4096: um plano semanal completo, com varios
#     dias e exercicios). E a mais longa de todas; 180 s evita cortar uma geracao legitima.
#   conexao (10 s): estabelecer a conexao nao deve demorar; falhar rapido e tentar de novo e melhor que esperar.
#   max_retries = 1: o SDK so repete erros transitorios (conexao, timeout, 408/409/429/5xx). Uma retentativa cobre um soluco de rede; mais que isso
#     multiplicaria o tempo (pior caso = 2 x timeout) e o gasto.
#
# Configuraveis por variavel de ambiente (segundos; vazio, invalido, <= 0 ou acima de 600 = padrao): AI_TIMEOUT_INSIGHT_SECONDS,
# AI_TIMEOUT_MEAL_SECONDS, AI_TIMEOUT_WORKOUT_PLAN_SECONDS e AI_CONNECT_TIMEOUT_SECONDS.
# ---------------------------------------------------------------------------------------------------------------
AI_KIND_INSIGHT = "insight"
AI_KIND_MEAL = "meal"
AI_KIND_WORKOUT_PLAN = "workout_plan"

DEFAULT_READ_TIMEOUT_SECONDS = {AI_KIND_INSIGHT: 60.0, AI_KIND_MEAL: 90.0, AI_KIND_WORKOUT_PLAN: 180.0}
DEFAULT_CONNECT_TIMEOUT_SECONDS = 10.0
MAX_TIMEOUT_SECONDS = 600.0
MAX_RETRIES = 1


def _seconds(raw: object, default: float, name: str) -> float:
    text = str(raw or "").strip()
    if not text:
        return default
    try:
        value = float(text)
    except ValueError:
        value = 0.0
    if not (0 < value <= MAX_TIMEOUT_SECONDS):
        logger.warning("ai_timeout_invalid var=%s usando_padrao=%s", name, default)
        return default
    return value


def request_timeout(kind: str = AI_KIND_INSIGHT) -> httpx.Timeout:
    """Timeout (leitura da resposta + conexao) da funcao `kind`. Le a configuracao a cada chamada."""
    configured = {
        AI_KIND_INSIGHT: ("AI_TIMEOUT_INSIGHT_SECONDS", settings.ai_timeout_insight_seconds),
        AI_KIND_MEAL: ("AI_TIMEOUT_MEAL_SECONDS", settings.ai_timeout_meal_seconds),
        AI_KIND_WORKOUT_PLAN: ("AI_TIMEOUT_WORKOUT_PLAN_SECONDS", settings.ai_timeout_workout_plan_seconds),
    }
    if kind not in configured:
        raise ValueError(f"funcao de IA desconhecida: {kind!r}")
    name, raw = configured[kind]
    read = _seconds(raw, DEFAULT_READ_TIMEOUT_SECONDS[kind], name)
    connect = _seconds(settings.ai_connect_timeout_seconds, DEFAULT_CONNECT_TIMEOUT_SECONDS, "AI_CONNECT_TIMEOUT_SECONDS")
    return httpx.Timeout(read, connect=connect)


_client: anthropic.Anthropic | None = None


def _base_client() -> anthropic.Anthropic:
    """Lazy init: evita quebrar a importacao do app se a API key nao
    estiver configurada ainda (ex: rodando localmente sem .env preenchido)."""
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=MAX_RETRIES)
    return _client


def get_client(kind: str = AI_KIND_INSIGHT) -> anthropic.Anthropic:
    """Cliente com o timeout da funcao `kind` (padrao: insight). Compartilha a conexao HTTP do cliente base (with_options so troca os limites).
    Chamadas que precisam de outro limite (ex.: image_moderation.py, que usa with_options(timeout=..., max_retries=0)) sobrescrevem por chamada."""
    return _base_client().with_options(timeout=request_timeout(kind), max_retries=MAX_RETRIES)
