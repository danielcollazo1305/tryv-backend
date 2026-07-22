"""
Geracao de plano de treino semanal via Claude, a partir do objetivo, nivel,
dias disponiveis, equipamento e observacoes do usuario.
Usa output_config.format (structured outputs) para garantir JSON valido,
mesmo padrao usado em meal_analysis.py.
"""
import json
import logging

from app.services.ai_client import MODEL, get_client

logger = logging.getLogger(__name__)

_EXERCISE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Nome do exercicio"},
        "sets": {"type": "integer", "description": "Numero de series"},
        "reps": {"type": "string", "description": "Repeticoes por serie (ex: '8-12' ou '30s')"},
        "rest_seconds": {"type": "integer", "description": "Descanso entre series, em segundos"},
        "notes": {"type": "string", "description": "Observacoes sobre execucao, carga ou variacao"},
    },
    "required": ["name", "sets", "reps", "rest_seconds", "notes"],
    "additionalProperties": False,
}

_DAY_SCHEMA = {
    "type": "object",
    "properties": {
        "day": {"type": "string", "description": "Ex: 'Segunda-feira' ou 'Dia 1'"},
        "focus": {"type": "string", "description": "Grupo muscular ou tipo de treino do dia"},
        "exercises": {"type": "array", "items": _EXERCISE_SCHEMA},
    },
    "required": ["day", "focus", "exercises"],
    "additionalProperties": False,
}

_WORKOUT_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "Resumo curto da estrategia do plano"},
        "days": {"type": "array", "items": _DAY_SCHEMA},
    },
    "required": ["summary", "days"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "Voce e um personal trainer que monta planos de treino semanais "
    "personalizados. Gere um plano estruturado e seguro, adequado ao "
    "objetivo, nivel de experiencia, dias disponiveis por semana e "
    "equipamento informado. Distribua os exercicios de forma equilibrada "
    "entre os dias e evite sobrecarregar o mesmo grupo muscular em dias "
    "consecutivos."
)


def generate_workout_plan(
    goal: str,
    level: str,
    days_per_week: int,
    equipment: str,
    notes: str | None = None,
) -> dict:
    """
    Gera um plano de treino semanal estruturado via IA.

    Levanta anthropic.APIError (ou subclasses) se a chamada a API falhar, e
    ValueError se a geracao for recusada ou vier incompleta — o router e
    responsavel por traduzir isso em uma resposta HTTP adequada.
    """
    prompt = (
        f"Objetivo: {goal}\n"
        f"Nivel de experiencia: {level}\n"
        f"Dias disponiveis por semana: {days_per_week}\n"
        f"Equipamento disponivel: {equipment}\n"
    )
    if notes:
        prompt += f"Observacoes adicionais: {notes}\n"
    prompt += f"\nMonte um plano de treino semanal para esses {days_per_week} dias."

    response = get_client().messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": _WORKOUT_PLAN_SCHEMA}},
    )

    if response.stop_reason == "refusal":
        logger.error("Geracao de plano de treino recusada pelos filtros de seguranca da IA")
        raise ValueError("Nao foi possivel gerar o plano de treino")
    if response.stop_reason == "max_tokens":
        logger.error("Geracao de plano de treino truncada por atingir max_tokens")
        raise ValueError("Resposta da IA incompleta")

    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)
