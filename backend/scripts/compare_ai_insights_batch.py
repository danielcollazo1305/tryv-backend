"""
Script pontual (nao commitado) pra rodar activity_insight/daily_insight
contra varias amostras de uma vez — Claude vs. OpenAI, dado de entrada
incluido — depois que um teste com uma unica corrida caiu num caso-limite
(GPS anomalo) e nao deu pra julgar qualidade com uma amostra so.

Amostras escolhidas a partir do que existe de verdade no banco de dev:
- 2 corridas normais (pace/distancia plausiveis)
- a corrida anomala ja testada antes (55.6m em 25min)
- uma segunda corrida anomala, de magnitude diferente (166.8m em 5min) —
  o banco de dev nao tem nenhum caso de pace impossivel ou distancia
  zerada de verdade, entao essa foi a anomalia mais distinta disponivel
- 1 semana "normal" pra daily_insight — o banco de dev tem so 1 usuario
  com dado nos ultimos 7 dias (1 corrida, 0 refeicoes), entao usei o
  exemplo sintetico ja existente no compare_ai_insights.py pra essa parte,
  deixado claramente marcado como tal abaixo.

Roda com: venv/Scripts/python.exe scripts/compare_ai_insights_batch.py
"""
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.models.run import Run  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import ai_client  # noqa: E402
from app.services.activity_insight import _INSIGHT_SCHEMA as ACTIVITY_SCHEMA  # noqa: E402
from app.services.activity_insight import _SYSTEM_PROMPT as ACTIVITY_PROMPT  # noqa: E402
from app.services.activity_insight import generate_activity_insight  # noqa: E402
from app.services.daily_insight import _INSIGHT_SCHEMA as DAILY_SCHEMA  # noqa: E402
from app.services.daily_insight import _SYSTEM_PROMPT as DAILY_PROMPT  # noqa: E402
from app.services.daily_insight import generate_daily_insight  # noqa: E402
from app.services.activity_plausibility import check_activity_plausibility  # noqa: E402
from app.routers.runs import _heart_rate_stats  # noqa: E402

RUN_SAMPLES = [
    ("Normal #1 (5000m / 25min, pace ~5:00/km)", uuid.UUID("0368d507-9541-423a-94b7-c69f9bcc33e5")),
    ("Normal #2 (2500m / 13:45min, pace ~5:30/km)", uuid.UUID("9439d1c4-2137-4d4f-9bc4-9c4ea5a7d7eb")),
    ("Anomalia ja testada (55.6m / 25min)", uuid.UUID("2df009ed-a53f-441e-bc8f-6eef4126d051")),
    ("Anomalia diferente (166.8m / 5min, magnitude menor)", uuid.UUID("b2fda2e6-0606-43b9-a5a2-38080984846a")),
]

_NORMAL_WEEKLY_SUMMARY = {
    "period_days": 7,
    "daily_calorie_goal": 2200,
    "meals_by_day": [
        {"date": "2026-08-04", "total_calories": 2050},
        {"date": "2026-08-05", "total_calories": 2400},
        {"date": "2026-08-06", "total_calories": 2150},
        {"date": "2026-08-07", "total_calories": 1800},
        {"date": "2026-08-08", "total_calories": 2300},
    ],
    "activities": [
        {"date": "2026-08-04", "type": "run", "duration_minutes": 32.0, "distance_meters": 5200, "avg_pace_seconds_per_km": 369},
        {"date": "2026-08-06", "type": "strength", "duration_minutes": 45},
        {"date": "2026-08-08", "type": "run", "duration_minutes": 28.0, "distance_meters": 4800, "avg_pace_seconds_per_km": 350},
    ],
    "heart_rate_avg": 132.0,
    "heart_rate_max": 168,
}


def _claude_structured(system_prompt: str, user_prompt: str, schema: dict) -> dict:
    response = ai_client.get_client().messages.create(
        model=ai_client.MODEL,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )
    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)


def _print_sample(index: int, label: str, input_data: dict, claude_out: dict, openai_out: dict) -> None:
    print(f"\n{'#' * 70}\nAMOSTRA {index}: {label}\n{'#' * 70}")
    print("\n--- Entrada ---")
    print(json.dumps(input_data, ensure_ascii=False, indent=2, default=str))
    print(f"\n--- Claude ({ai_client.MODEL}) ---")
    print(json.dumps(claude_out, ensure_ascii=False, indent=2))
    print("\n--- OpenAI (gpt-4o-mini) ---")
    print(json.dumps(openai_out, ensure_ascii=False, indent=2))


def run_activity_samples(db) -> int:
    idx = 0
    for label, run_id in RUN_SAMPLES:
        idx += 1
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            print(f"\nAMOSTRA {idx}: {label} — run_id {run_id} nao encontrado no banco, pulando")
            continue

        run_owner = db.query(User).filter(User.id == run.user_id).first()
        heart_rate_avg, heart_rate_max = _heart_rate_stats(db, run_owner, run.started_at, run.finished_at)
        activity_data = {
            "activity_type": run.activity_type,
            "duration_seconds": run.duration_seconds,
            "distance_meters": run.distance_meters,
            "avg_pace_seconds_per_km": run.avg_pace_seconds_per_km,
            "calories_burned": run.calories_burned,
            "heart_rate_avg": heart_rate_avg,
            "heart_rate_max": heart_rate_max,
        }
        prompt = (
            "Dados da atividade (campos ausentes/null nao se aplicam a esta modalidade):\n"
            + json.dumps(activity_data, ensure_ascii=False, indent=2, default=str)
            + "\n\nEscreva o resumo, destaque (se houver) e sugestao para essa atividade."
        )

        # Mesma checagem que generate_activity_insight ja aplica pra OpenAI —
        # replicada aqui so pra comparar as duas saidas com o MESMO prompt.
        anomaly = check_activity_plausibility(
            activity_data["activity_type"], activity_data["distance_meters"], activity_data["duration_seconds"]
        )
        if anomaly:
            prompt += (
                f"\n\nNota: os dados desta atividade parecem inconsistentes ({anomaly}) — "
                "possivel falha de GPS ou sensor. Considere isso na resposta, sem tentar "
                "validar exatamente o que aconteceu."
            )

        claude_out = _claude_structured(ACTIVITY_PROMPT, prompt, ACTIVITY_SCHEMA)
        openai_out = generate_activity_insight(activity_data)
        _print_sample(idx, f"activity_insight — {label}", activity_data, claude_out, openai_out)
    return idx


def run_daily_sample(db, start_index: int) -> None:
    idx = start_index + 1
    summary = _NORMAL_WEEKLY_SUMMARY
    recent_insights: list[str] = []
    prompt = (
        "Dados dos ultimos 7 dias do usuario:\n"
        + json.dumps(summary, ensure_ascii=False, indent=2, default=str)
        + "\n\nNao repita o sentido destes insights recentes ja mostrados ao usuario:\n"
        + json.dumps(recent_insights, ensure_ascii=False, indent=2)
        + "\n\nGere o insight do dia."
    )

    claude_out = _claude_structured(DAILY_PROMPT, prompt, DAILY_SCHEMA)
    openai_out = generate_daily_insight(summary, recent_insights)
    _print_sample(
        idx,
        "daily_insight — semana normal (SINTETICO: banco de dev so tem 1 usuario com dado real nos ultimos 7 dias, sem refeicoes)",
        summary,
        claude_out,
        openai_out,
    )


if __name__ == "__main__":
    db = SessionLocal()
    try:
        last_idx = run_activity_samples(db)
        run_daily_sample(db, last_idx)
    finally:
        db.close()
