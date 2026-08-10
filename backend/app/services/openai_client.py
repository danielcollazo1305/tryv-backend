"""
Cliente OpenAI compartilhado pelos servicos de baixo risco (insights curtos
gerados a partir de dados ja agregados pelo backend) — analise de foto de
refeicao e geracao de plano de treino continuam no Claude (ver ai_client.py).
"""
import openai

from app.core.config import settings

MODEL = "gpt-4o-mini"  # alternativa: "gpt-4.1-mini", se a qualidade nao bater

_client: openai.OpenAI | None = None


def get_client() -> openai.OpenAI:
    """Lazy init: evita quebrar a importacao do app se a API key nao
    estiver configurada ainda (ex: rodando localmente sem .env preenchido)."""
    global _client
    if _client is None:
        _client = openai.OpenAI(api_key=settings.openai_api_key)
    return _client
