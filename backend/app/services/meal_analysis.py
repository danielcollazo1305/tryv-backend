"""
Analise de fotos de refeicao via Claude (visao): estima calorias e macros.
Usa output_config.format (structured outputs) para garantir JSON valido,
em vez de pedir JSON no prompt e tentar interpretar o texto de volta.
"""
import base64
import json
import logging

from app.services.ai_client import MODEL, get_client

logger = logging.getLogger(__name__)

_MEAL_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": "Descricao curta do que foi identificado no prato",
        },
        "calories": {"type": "number", "description": "Calorias totais estimadas"},
        "protein": {"type": "number", "description": "Proteina em gramas"},
        "carbs": {"type": "number", "description": "Carboidrato em gramas"},
        "fat": {"type": "number", "description": "Gordura em gramas"},
        "confidence": {"type": "string", "enum": ["alta", "media", "baixa"]},
    },
    "required": ["description", "calories", "protein", "carbs", "fat", "confidence"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "Voce e um nutricionista que estima calorias e macronutrientes a partir "
    "de fotos de refeicoes. Analise a imagem e estime, da forma mais precisa "
    "possivel, as calorias totais e os gramas de proteina, carboidrato e "
    "gordura da refeicao mostrada. Se a porcao for dificil de estimar, "
    "assuma uma porcao individual tipica e reflita a incerteza no campo "
    "confidence."
)


def analyze_meal_photo(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    """
    Le uma foto de refeicao e retorna calorias + macros estimados.

    Levanta anthropic.APIError (ou subclasses) se a chamada a API falhar, e
    ValueError se a analise for recusada ou vier incompleta — o router e
    responsavel por traduzir isso em uma resposta HTTP adequada.
    """
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    response = get_client().messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                {"type": "text", "text": "Analise esta refeicao e estime calorias e macros."},
            ],
        }],
        output_config={"format": {"type": "json_schema", "schema": _MEAL_SCHEMA}},
    )

    if response.stop_reason == "refusal":
        logger.error("Analise de refeicao recusada pelos filtros de seguranca da IA")
        raise ValueError("Nao foi possivel analisar esta imagem")
    if response.stop_reason == "max_tokens":
        logger.error("Analise de refeicao truncada por atingir max_tokens")
        raise ValueError("Resposta da IA incompleta")

    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)
