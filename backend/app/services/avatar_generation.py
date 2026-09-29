"""
Geracao de avatar estilizado via OpenAI Images API (gpt-image-1-mini, mesmo
cliente/chave ja usados pelas chamadas de baixo risco -- ver
openai_client.py). A selfie original NUNCA e persistida em disco/S3/banco:
esta funcao so recebe bytes em memoria e devolve bytes em memoria, quem
decide o que fazer com o resultado e o chamador (ver routers/users.py,
POST /users/me/avatar).
"""
import base64
import logging

import openai

from app.services.openai_client import get_client

logger = logging.getLogger(__name__)

AVATAR_MODEL = "gpt-image-1-mini"

# Estetica generica da era PS1 (anos 90, baixo poligono, pixelizado) --
# proposital NAO citar nenhum titulo de jogo especifico (risco de
# copyright), so a descricao tecnica da epoca/estilo.
_AVATAR_PROMPT = (
    "Transforme esta foto de rosto em um retrato estilizado como um "
    "personagem de jogo de video game da era PlayStation 1 dos anos 90: "
    "modelagem 3D de baixo poligono (low-poly), texturas pixelizadas de "
    "baixa resolucao, sombreamento simples e travado (sem iluminacao "
    "suave/moderna), leve distorcao de perspectiva tipica de hardware de "
    "video game antigo. Mantenha a pose e o enquadramento de retrato "
    "(rosto centralizado), fundo neutro solido. Nao adicione texto, "
    "logotipos ou marcas d'agua."
)


class AvatarGenerationError(Exception):
    """Erro ao gerar o avatar via IA -- a mensagem e segura para expor ao usuario."""


def generate_ps1_avatar(image_bytes: bytes, content_type: str) -> bytes:
    """
    Chama a API de edicao de imagem da OpenAI com a selfie (em memoria) e
    retorna os bytes PNG do resultado estilizado.

    Levanta AvatarGenerationError em qualquer falha -- chamada rejeitada
    pelos filtros de moderacao de conteudo da OpenAI, timeout, erro de
    rede, ou resposta sem imagem -- o router traduz isso pra uma resposta
    HTTP adequada.
    """
    extension = content_type.split("/")[-1] or "jpg"
    filename = f"selfie.{extension}"

    try:
        response = get_client().images.edit(
            model=AVATAR_MODEL,
            image=(filename, image_bytes, content_type),
            prompt=_AVATAR_PROMPT,
            quality="low",
            size="1024x1024",
        )
    except openai.OpenAIError as e:
        logger.error("Falha na chamada de geracao de avatar via OpenAI: %s", e)
        raise AvatarGenerationError("Nao foi possivel gerar o avatar, tente novamente") from e

    if not response.data or not response.data[0].b64_json:
        logger.error("Resposta de geracao de avatar sem imagem (data/b64_json ausente)")
        raise AvatarGenerationError("Nao foi possivel gerar o avatar, tente novamente")

    return base64.b64decode(response.data[0].b64_json)
