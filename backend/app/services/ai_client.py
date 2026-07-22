"""
Cliente Claude compartilhado entre os servicos que fazem chamadas a API
(analise de refeicoes, e futuramente geracao de plano de treino).
"""
import os

import anthropic

MODEL = "claude-opus-4-8"

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    """Lazy init: evita quebrar a importacao do app se a API key nao
    estiver configurada ainda (ex: rodando localmente sem .env preenchido)."""
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client
