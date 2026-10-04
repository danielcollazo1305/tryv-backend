"""
Geracao de avatar estilizado via OpenAI Images API (edicao de imagem a partir
da selfie). Mesmo cliente/chave das chamadas de baixo risco (ver
openai_client.py). A selfie original NUNCA e persistida em disco/S3/banco:
esta funcao so recebe bytes em memoria e devolve bytes em memoria, quem
decide o que fazer com o resultado e o chamador (ver routers/users.py,
POST /users/me/avatar).
"""
import base64
import logging
import uuid

import openai

from app.core.config import settings
from app.services.openai_client import get_client

logger = logging.getLogger(__name__)

# Decisao do teste A/B de avatar: variante "V2" -- gpt-image-1.5, quality
# medium, input_fidelity=high e o prompt abaixo (low-poly facetado, fiel ao
# rosto), escolhida no lugar do baseline (gpt-image-1-mini, prompt PS1 em
# portugues) por preservar bem mais a semelhanca com a pessoa. O MODELO vem de
# settings.avatar_image_model (env AVATAR_IMAGE_MODEL, default "gpt-image-1.5"),
# pra poder trocar sem novo codigo. Atencao: o gpt-image-1-mini NAO suporta
# input_fidelity -- se a env apontar pra ele, a API rejeita o parametro.
AVATAR_STYLE_PROMPT = (
    "Transform this photo into a stylized 3D game character portrait in the look of "
    "1990s low-polygon console games: faceted low-poly geometry, flat shading with "
    "visible polygon edges, limited color palette, slightly blocky features, simple "
    "solid-color background. Keep the person clearly recognizable: preserve their "
    "exact face shape, facial proportions, eye shape and spacing, nose, mouth, "
    "eyebrows, hairstyle and hairline, facial hair pattern (beard/stubble), skin tone "
    "and expression. Head and shoulders, centered, facing the camera. No text, no "
    "logos, no watermark."
)
AVATAR_QUALITY = "medium"
AVATAR_INPUT_FIDELITY = "high"
AVATAR_SIZE = "1024x1024"

# Edicao com fidelidade alta e bem mais lenta que o mini (A/B: ~17 s na V2).
# Timeout explicito de 120 s por chamada (o padrao do SDK e 600 s) e SEM retry
# automatico: repetir uma geracao que estourou o tempo pode cobrar duas vezes,
# e a espera somada passaria muito do timeout do app mobile.
AVATAR_OPENAI_TIMEOUT_SECONDS = 120.0
AVATAR_OPENAI_MAX_RETRIES = 0

# Marcador facil de buscar nos logs (erro de saldo/cota ou de chave/permissao).
OPENAI_BILLING_OR_AUTH_LOG_MARKER = "OPENAI_BILLING_OR_AUTH_ERROR"
AVATAR_UNAVAILABLE_MESSAGE = "Servico de avatar temporariamente indisponivel. Tente mais tarde."
_BILLING_ERROR_CODES = {"insufficient_quota", "billing_hard_limit_reached", "billing_not_active"}


class AvatarGenerationError(Exception):
    """Erro ao gerar o avatar via IA -- a mensagem e segura para expor ao usuario."""


class AvatarServiceUnavailableError(AvatarGenerationError):
    """Problema NOSSO com a OpenAI (saldo/cota esgotado ou chave/permissao
    invalida), nao do usuario nem da foto -- o router responde 503 e nao
    consome a cota diaria."""


def _error_code(error: openai.OpenAIError) -> str | None:
    code = getattr(error, "code", None)
    if isinstance(code, str):
        return code
    body = getattr(error, "body", None)
    if isinstance(body, dict):
        inner = body.get("error", body)
        if isinstance(inner, dict) and isinstance(inner.get("code"), str):
            return inner["code"]
    return None


def _is_billing_or_auth_error(error: openai.OpenAIError) -> bool:
    """Chave invalida (401), sem permissao/organizacao nao verificada (403) ou
    saldo/cota esgotado. Um 429 comum de limite de taxa NAO entra aqui."""
    if isinstance(error, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return True
    return _error_code(error) in _BILLING_ERROR_CODES


def generate_ps1_avatar(image_bytes: bytes, content_type: str, user_id: uuid.UUID | str | None = None) -> bytes:
    """
    Chama a API de edicao de imagem da OpenAI com a selfie (em memoria) e
    retorna os bytes PNG do resultado estilizado.

    Levanta AvatarServiceUnavailableError se a OpenAI recusar por saldo/cota
    esgotado ou chave/permissao invalida, e AvatarGenerationError em qualquer
    outra falha -- chamada rejeitada pelos filtros de moderacao de conteudo,
    timeout, erro de rede ou resposta sem imagem. O router traduz cada uma pra
    uma resposta HTTP adequada. `user_id` so entra nos logs.
    """
    extension = content_type.split("/")[-1] or "jpg"
    filename = f"selfie.{extension}"
    model = settings.avatar_image_model

    try:
        response = (
            get_client()
            .with_options(timeout=AVATAR_OPENAI_TIMEOUT_SECONDS, max_retries=AVATAR_OPENAI_MAX_RETRIES)
            .images.edit(
                model=model,
                image=(filename, image_bytes, content_type),
                prompt=AVATAR_STYLE_PROMPT,
                quality=AVATAR_QUALITY,
                input_fidelity=AVATAR_INPUT_FIDELITY,
                size=AVATAR_SIZE,
            )
        )
    except openai.OpenAIError as e:
        if _is_billing_or_auth_error(e):
            # Sem str(e): a mensagem de erro de autenticacao pode trazer um trecho
            # da chave. So tipo, status HTTP e codigo.
            logger.error(
                "%s user_id=%s model=%s error_type=%s http_status=%s code=%s",
                OPENAI_BILLING_OR_AUTH_LOG_MARKER,
                user_id,
                model,
                type(e).__name__,
                getattr(e, "status_code", None),
                _error_code(e),
            )
            raise AvatarServiceUnavailableError(AVATAR_UNAVAILABLE_MESSAGE) from e
        logger.error("Falha na chamada de geracao de avatar via OpenAI: %s", e)
        raise AvatarGenerationError("Nao foi possivel gerar o avatar, tente novamente") from e

    if not response.data or not response.data[0].b64_json:
        logger.error("Resposta de geracao de avatar sem imagem (data/b64_json ausente)")
        raise AvatarGenerationError("Nao foi possivel gerar o avatar, tente novamente")

    # Log de custo: so user_id, modelo, quality e tokens -- nunca imagem nem outro dado pessoal.
    usage = getattr(response, "usage", None)
    logger.info(
        "avatar_generated user_id=%s model=%s quality=%s input_tokens=%s output_tokens=%s",
        user_id,
        model,
        AVATAR_QUALITY,
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
    )

    return base64.b64decode(response.data[0].b64_json)
