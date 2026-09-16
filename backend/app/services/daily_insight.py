"""
Geracao do insight diario proativo — combina refeicoes, atividades e FC dos
ultimos 7 dias num resumo, e pede pra Claude gerar UMA frase curta de
insight. Chamada de baixo risco (entrada ja estruturada, saida curta) — usa
LIGHT_MODEL (Sonnet) em vez do MODEL padrao (Opus) usado por
meal_analysis.py e workout_generator.py. Mesmo padrao de output_config/
json_schema ja usado nesses dois e em activity_insight.py.
"""
import json
import logging

from app.services.activity_plausibility import check_activity_plausibility
from app.services.ai_client import LIGHT_MODEL, get_client

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
    "Voce e o assistente de fitness do app Tryv Fit. Com base num resumo dos "
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

    Levanta anthropic.APIError (ou subclasses) se a chamada a API falhar, e
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

    anomalous_dates = []
    for activity in weekly_summary.get("activities", []):
        duration_seconds = (
            activity["duration_minutes"] * 60 if activity.get("duration_minutes") is not None else None
        )
        anomaly = check_activity_plausibility(
            activity.get("type"),
            activity.get("distance_meters"),
            duration_seconds,
        )
        if anomaly:
            anomalous_dates.append(activity.get("date", "data desconhecida"))

    if anomalous_dates:
        prompt += (
            "\n\nNota: os dados de atividade de " + ", ".join(anomalous_dates)
            + " parecem inconsistentes (possivel falha de GPS ou sensor). Considere "
            "isso na resposta, sem tentar validar exatamente o que aconteceu."
        )

    response = get_client().messages.create(
        model=LIGHT_MODEL,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": _INSIGHT_SCHEMA}},
    )

    if response.stop_reason == "refusal":
        logger.error("Geracao de insight diario recusada pelos filtros de seguranca da IA")
        raise ValueError("Nao foi possivel gerar o insight de hoje")
    if response.stop_reason == "max_tokens":
        logger.error("Geracao de insight diario truncada por atingir max_tokens")
        raise ValueError("Resposta da IA incompleta")

    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)
