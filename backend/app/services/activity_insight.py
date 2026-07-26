"""
Interpretacao textual de uma atividade (corrida rastreada por GPS ou
atividade manual) via Claude, usando output_config com json_schema — mesmo
padrao usado em meal_analysis.py e workout_generator.py.
"""
import json
import logging

from app.services.ai_client import MODEL, get_client

logger = logging.getLogger(__name__)

_INSIGHT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "Resumo da atividade em 1-2 frases"},
        "highlight": {
            "type": "string",
            "description": (
                "Um destaque positivo especifico sobre a atividade (ex: pace forte, "
                "FC controlada, duracao consistente); string vazia se nao houver nada notavel"
            ),
        },
        "suggestion": {"type": "string", "description": "Uma sugestao pratica e acionavel para a proxima atividade"},
    },
    "required": ["summary", "highlight", "suggestion"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "Voce e um treinador que interpreta os dados de uma atividade fisica "
    "registrada pelo usuario e escreve um comentario curto, encorajador e "
    "especifico sobre ela, em portugues. Adapte o comentario ao tipo de "
    "atividade: para corrida, ciclismo e caminhada, comente sobre pace ou "
    "velocidade quando fizer sentido; para lutas, natacao, HIIT e outras "
    "modalidades sem pace relevante, foque em duracao, frequencia cardiaca "
    "e esforco percebido, sem inventar metricas de velocidade que nao "
    "existem para essas atividades. Se nao houver um destaque claro nos "
    "dados, retorne uma string vazia no campo highlight em vez de inventar "
    "algo."
)


def generate_activity_insight(activity_data: dict) -> dict:
    """
    Gera uma interpretacao textual (resumo, destaque, sugestao) para uma
    atividade, a partir de um dict com tipo, duracao, distancia (se
    houver), calorias, FC media/maxima (se disponivel) e pace (se houver).

    Levanta anthropic.APIError (ou subclasses) se a chamada a API falhar, e
    ValueError se a geracao for recusada ou vier incompleta — o router e
    responsavel por traduzir isso em uma resposta HTTP adequada.
    """
    prompt = (
        "Dados da atividade (campos ausentes/null nao se aplicam a esta modalidade):\n"
        + json.dumps(activity_data, ensure_ascii=False, indent=2, default=str)
        + "\n\nEscreva o resumo, destaque (se houver) e sugestao para essa atividade."
    )

    response = get_client().messages.create(
        model=MODEL,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": _INSIGHT_SCHEMA}},
    )

    if response.stop_reason == "refusal":
        logger.error("Geracao de insight de atividade recusada pelos filtros de seguranca da IA")
        raise ValueError("Nao foi possivel gerar a interpretacao da atividade")
    if response.stop_reason == "max_tokens":
        logger.error("Geracao de insight de atividade truncada por atingir max_tokens")
        raise ValueError("Resposta da IA incompleta")

    text = next(block.text for block in response.content if block.type == "text")
    result = json.loads(text)
    result["highlight"] = result.get("highlight") or None
    return result
