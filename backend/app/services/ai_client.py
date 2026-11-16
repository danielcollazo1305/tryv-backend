"""
Cliente Claude compartilhado entre os servicos que fazem chamadas a API
(analise de refeicoes, geracao de plano de treino).
"""
import anthropic
import httpx

from app.core.config import settings

MODEL = "claude-opus-4-8"

# Modelo mais barato usado pelas chamadas de baixo risco (insights curtos a
# partir de dados ja agregados: daily_insight.py, activity_insight.py), que
# passam isso explicitamente na chamada. meal_analysis.py e
# workout_generator.py continuam usando MODEL (Opus) por padrao, sem
# precisar mudar nada.
LIGHT_MODEL = "claude-sonnet-5"

# Limites explicitos de rede (antes valiam os padroes do SDK: 10 min de timeout e 2 retentativas, ou seja, uma chamada travada podia prender uma
# thread do servidor por mais de 30 min). Total: 60 s de leitura (a geracao de plano com raciocinio chega a ~45 s, o timeout do app), 10 s para
# conectar e 1 retentativa (o SDK ja so repete erros transitorios: conexao, timeout, 408/409/429/5xx), no pior caso ~2 min por chamada.
REQUEST_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
MAX_RETRIES = 1

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    """Lazy init: evita quebrar a importacao do app se a API key nao
    estiver configurada ainda (ex: rodando localmente sem .env preenchido).
    Chamadas que precisam de outro limite (ex.: image_moderation.py, que usa
    with_options(timeout=..., max_retries=0)) sobrescrevem por chamada."""
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=REQUEST_TIMEOUT, max_retries=MAX_RETRIES)
    return _client
