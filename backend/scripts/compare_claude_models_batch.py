"""
Script pontual (nao commitado) pra comparar Claude Opus (modelo atual) vs.
Claude Sonnet 5 nas mesmas 5 amostras usadas na comparacao Claude-vs-OpenAI
(compare_ai_insights_batch.py) — pra decidir se da pra rebaixar
daily_insight/activity_insight de Opus pra Sonnet sem perder qualidade.

Os dois lados usam o MESMO client (app/services/ai_client.py), so trocando
o parametro `model` da chamada — nao mexe em nada de producao, o
ai_client.MODEL atual (Opus) continua intocado.

Roda com: venv/Scripts/python.exe scripts/compare_claude_models_batch.py
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
from app.services.daily_insight import _INSIGHT_SCHEMA as DAILY_SCHEMA  # noqa: E402
from app.services.daily_insight import _SYSTEM_PROMPT as DAILY_PROMPT  # noqa: E402
from app.services.activity_plausibility import check_activity_plausibility  # noqa: E402
from app.routers.runs import _heart_rate_stats  # noqa: E402

OPUS_MODEL = "claude-opus-4-8"  # ai_client.MODEL atual, em producao
SONNET_MODEL = "claude-sonnet-5"

RUN_SAMPLES = [
    ("Normal #1 (5000m / 25min, pace ~5:00/km)", uuid.UUID("0368d507-9541-423a-94b7-c69f9bcc33e5")),
    ("Normal #2 (2500m / 13:45min, pace ~5:30/km)", uuid.UUID("9439d1c4-2137-4d4f-9bc4-9c4ea5a7d7eb")),
    ("Anomalia de GPS (55.6m / 25min)", uuid.UUID("2df009ed-a53f-441e-bc8f-6eef4126d051")),
    ("Anomalia menor (166.8m / 5min)", uuid.UUID("b2fda2e6-0606-43b9-a5a2-38080984846a")),
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


def _claude_structured(model: str, system_prompt: str, user_prompt: str, schema: dict) -> dict:
    response = ai_client.get_client().messages.create(
        model=model,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )
    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)


def _print_sample(index: int, label: str, input_data: dict, opus_out: dict, sonnet_out: dict) -> None:
    print(f"\n{'#' * 70}\nAMOSTRA {index}: {label}\n{'#' * 70}")
    print("\n--- Entrada ---")
    print(json.dumps(input_data, ensure_ascii=False, indent=2, default=str))
    print(f"\n--- Opus ({OPUS_MODEL}) ---")
    print(json.dumps(opus_out, ensure_ascii=False, indent=2))
    print(f"\n--- Sonnet ({SONNET_MODEL}) ---")
    print(json.dumps(sonnet_out, ensure_ascii=False, indent=2))


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

        # Mesma checagem de plausibilidade que ja esta em producao (via
        # activity_insight.py) — replicada aqui so pra comparar as duas
        # saidas com o MESMO prompt.
        anomaly = check_activity_plausibility(
            activity_data["activity_type"], activity_data["distance_meters"], activity_data["duration_seconds"]
        )
        if anomaly:
            prompt += (
                f"\n\nNota: os dados desta atividade parecem inconsistentes ({anomaly}) — "
                "possivel falha de GPS ou sensor. Considere isso na resposta, sem tentar "
                "validar exatamente o que aconteceu."
            )

        opus_out = _claude_structured(OPUS_MODEL, ACTIVITY_PROMPT, prompt, ACTIVITY_SCHEMA)
        sonnet_out = _claude_structured(SONNET_MODEL, ACTIVITY_PROMPT, prompt, ACTIVITY_SCHEMA)
        _print_sample(idx, f"activity_insight — {label}", activity_data, opus_out, sonnet_out)
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

    opus_out = _claude_structured(OPUS_MODEL, DAILY_PROMPT, prompt, DAILY_SCHEMA)
    sonnet_out = _claude_structured(SONNET_MODEL, DAILY_PROMPT, prompt, DAILY_SCHEMA)
    _print_sample(
        idx,
        "daily_insight — semana normal (SINTETICO, mesmo exemplo do teste anterior)",
        summary,
        opus_out,
        sonnet_out,
    )


if __name__ == "__main__":
    db = SessionLocal()
    try:
        last_idx = run_activity_samples(db)
        run_daily_sample(db, last_idx)
    finally:
        db.close()
