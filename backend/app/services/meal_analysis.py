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

_TEXT_SYSTEM_PROMPT = (
    "Voce e um nutricionista que estima calorias e macronutrientes a partir "
    "da descricao textual de um alimento ou refeicao (sem foto). Estime, da "
    "forma mais precisa possivel, as calorias totais e os gramas de "
    "proteina, carboidrato e gordura. Quando a quantidade/peso for "
    "informado, use-o como base do calculo. Quando NAO for informado, "
    "assuma uma porcao individual tipica para o que foi descrito e reflita "
    "essa incerteza extra no campo confidence (nunca 'alta' sem quantidade "
    "informada)."
)


def analyze_meal_photo(image_bytes: bytes, media_type: str = "image/jpeg", user_hint: str | None = None) -> dict:
    """
    Le uma foto de refeicao e retorna calorias + macros estimados.

    `user_hint` e texto opcional do usuario descrevendo o que esta na foto
    (ex: "cuscuz com ovo") -- usado tanto pra dica previa (antes da 1a
    analise) quanto pra correcao pos-analise (mesma foto, novo hint
    dizendo o que a IA errou, ex: "isso e cuscuz, nao farinha"). Existe
    porque visao computacional erra identificacao em alimentos visualmente
    parecidos (textura/cor similar) -- contexto textual reduz esse erro.
    Sem hint, o comportamento e identico a antes desta tarefa.

    Levanta anthropic.APIError (ou subclasses) se a chamada a API falhar, e
    ValueError se a analise for recusada ou vier incompleta — o router e
    responsavel por traduzir isso em uma resposta HTTP adequada.
    """
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = "Analise esta refeicao e estime calorias e macros."
    if user_hint and user_hint.strip():
        prompt = (
            f"Analise esta refeicao e estime calorias e macros. O usuario descreveu: "
            f"'{user_hint.strip()}' — use essa informacao pra identificar corretamente "
            f"o alimento, especialmente se a aparencia visual for ambigua."
        )

    response = get_client().messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                {"type": "text", "text": prompt},
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


def analyze_meal_text(description: str, quantity: str | None = None) -> dict:
    """
    Estima calorias + macros a partir de uma descricao textual do
    alimento (ex: "200g de cuscuz", "peito de frango grelhado"). Mesmo
    formato de retorno de analyze_meal_photo (mesmo _MEAL_SCHEMA) -- o
    router devolve os 2 no mesmo response_model (MealAnalysisOut), o lado
    mobile reaproveita o mesmo tipo MealAnalysis pros 2 modos.

    Mesmas excecoes de analyze_meal_photo: anthropic.APIError (falha na
    chamada) e ValueError (recusa/resposta incompleta) — o router traduz
    pra HTTP.
    """
    prompt = f"Alimento/refeicao: {description}"
    if quantity and quantity.strip():
        prompt += f"\nQuantidade/peso informado: {quantity.strip()}"
    else:
        prompt += "\nQuantidade/peso nao informado — assuma uma porcao individual tipica."
    prompt += "\nEstime calorias e macros."

    response = get_client().messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=_TEXT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": _MEAL_SCHEMA}},
    )

    if response.stop_reason == "refusal":
        logger.error("Analise de refeicao por texto recusada pelos filtros de seguranca da IA")
        raise ValueError("Nao foi possivel analisar esta descricao")
    if response.stop_reason == "max_tokens":
        logger.error("Analise de refeicao por texto truncada por atingir max_tokens")
        raise ValueError("Resposta da IA incompleta")

    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)
