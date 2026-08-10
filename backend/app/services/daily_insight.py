"""
Geracao do insight diario proativo — combina refeicoes, atividades e FC dos
ultimos 7 dias num resumo, e pede pra IA gerar UMA frase curta de insight.
Chamada de baixo risco (entrada ja estruturada, saida curta) — migrada pra
OpenAI; mesmo padrao de schema JSON ja usado em meal_analysis.py,
workout_generator.py e activity_insight.py (esses dois continuam no Claude).
"""
import json
import logging

from app.services.openai_client import MODEL, get_client

logger = logging.getLogger(__name__)

_INSIGHT_SCHEMA = {
    "type": "object",
    "properties": {
        "insight_text": {
            "type": "string",
            "description": "Uma frase curta e acionavel de insight, em portugues, no maximo 2 linhas",
        },
        "category": {"type": "string", "enum": ["nutrition", "training", "recovery", "general"]},
    },
    "required": ["insight_text", "category"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "Voce e o assistente de fitness do app Tryv. Com base num resumo dos "
    "ultimos 7 dias de atividade do usuario (refeicoes/calorias, treinos e "
    "atividades fisicas, frequencia cardiaca quando disponivel), gere UM "
    "insight curto e acionavel, em portugues, com tom motivacional mas "
    "direto, no maximo 2 linhas. Baseie-se apenas nos dados fornecidos, sem "
    "inventar numeros ou eventos que nao estao nos dados. Nao repita o "
    "sentido de insights recentes ja mostrados ao usuario, informados no "
    "prompt. Classifique o insight numa categoria: 'nutrition' para algo "
    "relacionado a alimentacao/calorias, 'training' para treinos/atividades/"
    "desempenho, 'recovery' para descanso/recuperacao, ou 'general' caso "
    "nenhuma das anteriores se aplique claramente."
)


def generate_daily_insight(weekly_summary: dict, recent_insights: list[str]) -> dict:
    """
    Gera o insight do dia a partir de um resumo dos ultimos 7 dias do
    usuario e da lista dos ultimos insights ja mostrados (para nao repetir).

    Levanta openai.APIError (ou subclasses) se a chamada a API falhar, e
    ValueError se a geracao for recusada ou vier incompleta — o router e
    responsavel por traduzir isso em uma resposta HTTP adequada.
    """
    prompt = (
        "Dados dos ultimos 7 dias do usuario:\n"
        + json.dumps(weekly_summary, ensure_ascii=False, indent=2, default=str)
        + "\n\nNao repita o sentido destes insights recentes ja mostrados ao usuario:\n"
        + json.dumps(recent_insights, ensure_ascii=False, indent=2)
        + "\n\nGere o insight do dia."
    )

    response = get_client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "daily_insight", "schema": _INSIGHT_SCHEMA, "strict": True},
        },
    )

    choice = response.choices[0]
    if choice.finish_reason == "content_filter":
        logger.error("Geracao de insight diario recusada pelos filtros de seguranca da IA")
        raise ValueError("Nao foi possivel gerar o insight de hoje")
    if choice.finish_reason == "length":
        logger.error("Geracao de insight diario truncada por atingir o limite de tokens")
        raise ValueError("Resposta da IA incompleta")

    return json.loads(choice.message.content)
