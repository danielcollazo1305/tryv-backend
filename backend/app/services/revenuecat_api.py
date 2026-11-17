"""Chamadas a API REST do RevenueCat feitas pelo backend (hoje so a exclusao de assinante, na exclusao de conta).

ATENCAO -- VALIDAR CONTRA A API REAL: esta chamada foi escrita pela documentacao oficial e NUNCA foi executada contra o RevenueCat
(nao ha chave neste ambiente). Fonte: https://www.revenuecat.com/docs/api-v1/customers (secao "Delete Customer") e
https://www.revenuecat.com/docs/api-v1 (base URL e cabecalho de autorizacao). Segundo essas paginas:
  - DELETE https://api.revenuecat.com/v1/subscribers/{app_user_id}
  - Authorization: Bearer <chave secreta da API v1> (a pagina so diz "BearerAuth"; confirmar que e a chave SECRETA, nao a publica do SDK)
  - 200 {"app_user_id": "...", "deleted": true} = exclusao PEDIDA (processada de forma assincrona); 404 = o cliente nao existe
    (tratado aqui como sucesso: "apos um 200, trate 404 como confirmacao de que o cliente nao existe"); 401 = nao autorizado.
Antes de depender disto em producao: testar com um usuario de sandbox e conferir status, corpo e o efeito no painel do RevenueCat.

Isolada de proposito (um unico ponto de rede, `_request`), para os testes simularem a chamada sem rede.
"""
import logging
import urllib.parse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

API_BASE_URL = "https://api.revenuecat.com/v1"
TIMEOUT_SECONDS = 5.0


class RevenueCatDeleteError(Exception):
    """Falha ao pedir a exclusao do assinante (HTTP inesperado ou erro de rede)."""


def _request(method: str, url: str, headers: dict[str, str]) -> httpx.Response:
    """Unico ponto de rede deste modulo."""
    return httpx.request(method, url, headers=headers, timeout=TIMEOUT_SECONDS)


def delete_subscriber(app_user_id: str) -> bool:
    """Pede ao RevenueCat a exclusao do assinante (identificado pelo id do usuario no Tryv, que e o app_user_id do SDK).
    Devolve False SEM chamar a rede se REVENUECAT_API_SECRET estiver vazia; True se o pedido foi aceito (200) ou o assinante ja
    nao existe (404). Levanta RevenueCatDeleteError em qualquer outra resposta ou erro de rede. Nunca loga a chave."""
    secret = settings.revenuecat_api_secret
    if not secret:
        return False
    url = f"{API_BASE_URL}/subscribers/{urllib.parse.quote(app_user_id, safe='')}"
    try:
        response = _request("DELETE", url, {"Authorization": f"Bearer {secret}"})
    except httpx.HTTPError as error:
        raise RevenueCatDeleteError(f"erro de rede ({type(error).__name__})") from error
    if response.status_code in (200, 404):
        return True
    raise RevenueCatDeleteError(f"resposta inesperada (HTTP {response.status_code})")
