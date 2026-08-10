"""
Comparacao manual Claude vs. OpenAI para os dois insights migrados
(daily_insight, activity_insight) — usa dados reais do banco de dev quando
disponiveis (fallback pra um exemplo sintetico senao), chama os MESMOS
system prompt e schema JSON nos dois provedores, e imprime lado a lado pra
avaliacao manual de qualidade antes de decidir manter a migracao.

Nao faz parte do app (nao e importado por nenhum router) — roda com:

    venv/Scripts/python.exe scripts/compare_ai_insights.py

Precisa de ANTHROPIC_API_KEY e OPENAI_API_KEY configuradas no .env.
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.models.daily_insight import DailyInsight  # noqa: E402
from app.models.run import Run  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import ai_client  # noqa: E402
from app.services.activity_insight import _INSIGHT_SCHEMA as ACTIVITY_SCHEMA  # noqa: E402
from app.services.activity_insight import _SYSTEM_PROMPT as ACTIVITY_PROMPT  # noqa: E402
from app.services.activity_insight import generate_activity_insight  # noqa: E402
from app.services.daily_insight import _INSIGHT_SCHEMA as DAILY_SCHEMA  # noqa: E402
from app.services.daily_insight import _SYSTEM_PROMPT as DAILY_PROMPT  # noqa: E402
from app.services.daily_insight import generate_daily_insight  # noqa: E402
from app.routers.insights import _collect_weekly_summary  # noqa: E402
from app.routers.runs import _heart_rate_stats  # noqa: E402

_FALLBACK_WEEKLY_SUMMARY = {
    "period_days": 7,
    "daily_calorie_goal": 2200,
    "meals_by_day": [
        {"date": "2026-08-04", "total_calories": 2050},
        {"date": "2026-08-05", "total_calories": 2400},
        {"date": "2026-08-07", "total_calories": 1800},
    ],
    "activities": [
        {"date": "2026-08-04", "type": "run", "duration_minutes": 32.0, "distance_meters": 5200, "avg_pace_seconds_per_km": 369},
        {"date": "2026-08-06", "type": "strength", "duration_minutes": 45},
    ],
    "heart_rate_avg": 138.2,
    "heart_rate_max": 172,
}

_FALLBACK_ACTIVITY_DATA = {
    "activity_type": "run",
    "duration_seconds": 1920,
    "distance_meters": 5200,
    "avg_pace_seconds_per_km": 369,
    "calories_burned": 410,
    "heart_rate_avg": 148.5,
    "heart_rate_max": 171,
}


def _claude_structured(system_prompt: str, user_prompt: str, schema: dict) -> dict:
    """Mesma chamada que os servicos faziam antes da migracao — usada aqui
    so pra efeito de comparacao lado a lado, nao roda em producao."""
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


def _print_side_by_side(title: str, claude_out: dict, openai_out: dict) -> None:
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")
    print(f"\n--- Claude ({ai_client.MODEL}) ---")
    print(json.dumps(claude_out, ensure_ascii=False, indent=2))
    print("\n--- OpenAI (gpt-4o-mini) ---")
    print(json.dumps(openai_out, ensure_ascii=False, indent=2))


def compare_daily_insight(db) -> None:
    start = datetime.utcnow() - timedelta(days=7)
    user_with_data = (
        db.query(User)
        .join(DailyInsight, DailyInsight.user_id == User.id, isouter=True)
        .filter(User.created_at <= datetime.utcnow())
        .first()
    )

    if user_with_data:
        summary = _collect_weekly_summary(db, user_with_data)
    else:
        summary = None

    if not summary or not (summary["meals_by_day"] or summary["activities"]):
        print("(sem dado real suficiente no banco de dev — usando exemplo sintetico)")
        summary = _FALLBACK_WEEKLY_SUMMARY

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
    _print_side_by_side("DAILY INSIGHT", claude_out, openai_out)


def compare_activity_insight(db) -> None:
    run = db.query(Run).order_by(Run.started_at.desc()).first()

    if run:
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
    else:
        print("(sem corrida real no banco de dev — usando exemplo sintetico)")
        activity_data = _FALLBACK_ACTIVITY_DATA

    prompt = (
        "Dados da atividade (campos ausentes/null nao se aplicam a esta modalidade):\n"
        + json.dumps(activity_data, ensure_ascii=False, indent=2, default=str)
        + "\n\nEscreva o resumo, destaque (se houver) e sugestao para essa atividade."
    )

    claude_out = _claude_structured(ACTIVITY_PROMPT, prompt, ACTIVITY_SCHEMA)
    openai_out = generate_activity_insight(activity_data)
    _print_side_by_side("ACTIVITY INSIGHT", claude_out, openai_out)


if __name__ == "__main__":
    db = SessionLocal()
    try:
        compare_daily_insight(db)
        compare_activity_insight(db)
    finally:
        db.close()
