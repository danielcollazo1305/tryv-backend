"""
Cliente Claude compartilhado entre os servicos que fazem chamadas a API
(analise de refeicoes, geracao de plano de treino).
"""
import anthropic

from app.core.config import settings

MODEL = "claude-opus-4-8"

# Modelo mais barato usado pelas chamadas de baixo risco (insights curtos a
# partir de dados ja agregados: daily_insight.py, activity_insight.py), que
# passam isso explicitamente na chamada. meal_analysis.py e
# workout_generator.py continuam usando MODEL (Opus) por padrao, sem
# precisar mudar nada.
LIGHT_MODEL = "claude-sonnet-5"

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    """Lazy init: evita quebrar a importacao do app se a API key nao
    estiver configurada ainda (ex: rodando localmente sem .env preenchido)."""
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client
