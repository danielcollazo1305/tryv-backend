"""
Envio de e-mail via Resend (https://resend.com) — API HTTP simples, sem SDK.
Usado hoje so pelo fluxo de recuperacao de senha (ver routers/auth.py).

LIMITACAO ATUAL — dominio nao verificado no Resend: enquanto isso nao
acontece, a conta so pode enviar para o proprio e-mail associado a ela
(o do dono do projeto) usando o remetente de teste `onboarding@resend.dev`.
Qualquer tentativa de envio pra outro destinatario retorna 403 do lado do
Resend. Por isso send_email() nunca propaga excecao pra quem chama — so
loga o erro e devolve False, deixando o endpoint responder com a mesma
mensagem generica de sempre (nao da pra revelar, pela resposta da API, se
o e-mail realmente foi entregue). Assim que o dominio for verificado, essa
limitacao desaparece sozinha (nenhum outro codigo precisa mudar).
"""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> bool:
    """Retorna True se o Resend aceitou o envio, False em qualquer falha (ja logada)."""
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY nao configurada — e-mail para %s nao enviado.", to)
        return False

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.resend_from_email,
                "to": [to],
                "subject": subject,
                "html": html,
            },
            timeout=10,
        )
    except httpx.HTTPError:
        logger.exception("Falha de rede ao chamar a API do Resend (destinatario=%s).", to)
        return False

    if response.status_code >= 400:
        # 403 e o caso esperado hoje (dominio de teste, ver docstring do modulo)
        # — logado mas nao tratado como excepcional pra nao poluir os logs.
        logger.warning(
            "Resend recusou o envio para %s (status=%s): %s",
            to,
            response.status_code,
            response.text,
        )
        return False

    return True
