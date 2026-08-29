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
        # Convencao: indice nativo do JS (Date.getDay()), 0=domingo ... 6=sabado
        # — NAO ISO (que comeca em segunda=0/1). Escolhido pra nao exigir
        # conversao no client (mobile e 100% TS/JS). Usado pelo app pra saber
        # com confianca qual dia do plano e "hoje" (ver
        # getTodayOrNextWorkoutDay em services/workouts.ts do mobile).
        "day_of_week": {
            "type": "integer",
            "description": (
                "Indice do dia da semana em que ESSE treino especifico deve "
                "ser feito: 0=domingo, 1=segunda, 2=terca, 3=quarta, "
                "4=quinta, 5=sexta, 6=sabado. Distribua os dias de treino "
                "de forma realista e espacada ao longo da semana (ex: 3x/"
                "semana deve virar segunda=1, quarta=3, sexta=5 — nunca "
                "3 dias seguidos), nao apenas 0,1,2... em sequencia."
            ),
        },
        "focus": {"type": "string", "description": "Grupo muscular ou tipo de treino do dia"},
        "exercises": {"type": "array", "items": _EXERCISE_SCHEMA},
        "estimated_duration_minutes": {
            "type": "integer",
            "description": "Estimativa de duracao total do treino do dia, em minutos",
        },
        "estimated_calories": {
            "type": "integer",
            "description": "Estimativa de calorias gastas no treino do dia",
        },
    },
    "required": [
        "day",
        "day_of_week",
        "focus",
        "exercises",
        "estimated_duration_minutes",
        "estimated_calories",
    ],
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
    "consecutivos.\n\n"
    "O objetivo pode ser um objetivo tradicional de academia (emagrecimento, "
    "hipertrofia, resistencia) ou uma modalidade esportiva especifica "
    "(corrida, ciclismo, natacao, luta/artes marciais, caminhada, HIIT, "
    "etc.). Adapte a ESTRUTURA do plano ao tipo de atividade em vez de "
    "assumir sempre um treino de musculacao:\n"
    "- Luta/artes marciais: monte rounds e tecnicas (golpes, combinacoes, "
    "sparring, defesa) em vez de series convencionais.\n"
    "- Natacao: monte series de nado com distancia e estilo (ex: '4x100m "
    "crawl').\n"
    "- Corrida, ciclismo, caminhada, HIIT: inclua intervalos de intensidade "
    "e volume apropriados (ex: tiros, blocos de recuperacao).\n"
    "Os campos 'sets' e 'reps' de cada exercicio sao flexiveis — use-os "
    "para representar o que fizer mais sentido na modalidade (numero de "
    "rounds/series de nado e sua duracao/distancia, ou series/repeticoes "
    "tradicionais de musculacao).\n\n"
    "Para cada dia, estime tambem a duracao total do treino em minutos "
    "(estimated_duration_minutes) e o gasto calorico aproximado "
    "(estimated_calories), considerando o volume, a intensidade e o "
    "numero de exercicios daquele dia especifico.\n\n"
    "Alem disso, atribua a cada dia um day_of_week (0=domingo...6=sabado) "
    "que represente em que dia real da semana esse treino especifico deve "
    "ser feito, distribuindo os dias de treino de forma espacada e "
    "realista ao longo da semana (nunca todos em sequencia, a nao ser que "
    "days_per_week cubra a semana inteira)."
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
