import logging
from datetime import date, datetime, timedelta

import anthropic
import openai
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_pro_subscription
from app.models.daily_insight import DailyInsight
from app.models.heart_rate import HeartRateSample
from app.models.manual_activity import ManualActivity
from app.models.meal import Meal
from app.models.run import Run
from app.models.user import User
from app.schemas.daily_insight import DailyInsightOut
from app.services.daily_insight import generate_daily_insight

router = APIRouter(prefix="/insights", tags=["insights"])
logger = logging.getLogger(__name__)

_WINDOW_DAYS = 7
_RECENT_INSIGHTS_LIMIT = 3
_NO_DATA_TEXT = "Continue registrando suas atividades e refeicoes para receber insights personalizados."
_NO_DATA_CATEGORY = "general"


def _collect_weekly_summary(db: Session, current_user: User) -> dict:
    start_datetime = datetime.utcnow() - timedelta(days=_WINDOW_DAYS)

    meal_rows = (
        db.query(func.date(Meal.logged_at).label("day"), func.sum(Meal.calories).label("total_calories"))
        .filter(Meal.user_id == current_user.id, Meal.logged_at >= start_datetime, Meal.calories.isnot(None))
        .group_by(func.date(Meal.logged_at))
        .order_by("day")
        .all()
    )
    meals_by_day = [{"date": row.day.isoformat(), "total_calories": row.total_calories} for row in meal_rows]

    runs = (
        db.query(Run)
        .filter(Run.user_id == current_user.id, Run.started_at >= start_datetime)
        .order_by(Run.started_at.asc())
        .all()
    )
    manual_activities = (
        db.query(ManualActivity)
        .filter(ManualActivity.user_id == current_user.id, ManualActivity.performed_at >= start_datetime)
        .order_by(ManualActivity.performed_at.asc())
        .all()
    )

    activities = [
        {
            "date": run.started_at.date().isoformat(),
            "type": run.activity_type,
            "duration_minutes": round(run.duration_seconds / 60, 1),
            "distance_meters": run.distance_meters,
            "avg_pace_seconds_per_km": run.avg_pace_seconds_per_km,
        }
        for run in runs
    ] + [
        {
            "date": activity.performed_at.date().isoformat(),
            "type": activity.activity_type,
            "duration_minutes": activity.duration_minutes,
        }
        for activity in manual_activities
    ]

    bpms = [
        row[0]
        for row in db.query(HeartRateSample.bpm)
        .filter(HeartRateSample.user_id == current_user.id, HeartRateSample.recorded_at >= start_datetime)
        .all()
    ]
    heart_rate_avg = round(sum(bpms) / len(bpms), 1) if bpms else None
    heart_rate_max = max(bpms) if bpms else None

    return {
        "period_days": _WINDOW_DAYS,
        "daily_calorie_goal": current_user.daily_calorie_goal,
        "meals_by_day": meals_by_day,
        "activities": activities,
        "heart_rate_avg": heart_rate_avg,
        "heart_rate_max": heart_rate_max,
    }


def _has_any_data(summary: dict) -> bool:
    return bool(summary["meals_by_day"] or summary["activities"])


def _generate_and_upsert(db: Session, current_user: User) -> DailyInsight:
    today = date.today()
    summary = _collect_weekly_summary(db, current_user)

    if not _has_any_data(summary):
        insight_text = _NO_DATA_TEXT
        category = _NO_DATA_CATEGORY
    else:
        recent_insights = [
            row.insight_text
            for row in db.query(DailyInsight)
            .filter(DailyInsight.user_id == current_user.id, DailyInsight.date < today)
            .order_by(DailyInsight.date.desc())
            .limit(_RECENT_INSIGHTS_LIMIT)
            .all()
        ]
        try:
            result = generate_daily_insight(summary, recent_insights)
        except (anthropic.APIError, openai.APIError, ValueError) as e:
            logger.error("Falha ao gerar insight diario (user_id=%s): %s", current_user.id, e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Nao foi possivel gerar o insight de hoje, tente novamente",
            )
        insight_text = result["insight_text"]
        category = result["category"]

    existing = (
        db.query(DailyInsight)
        .filter(DailyInsight.user_id == current_user.id, DailyInsight.date == today)
        .first()
    )
    if existing:
        existing.insight_text = insight_text
        existing.category = category
        existing.source_data_snapshot = summary
        db.commit()
        db.refresh(existing)
        return existing

    insight = DailyInsight(
        user_id=current_user.id,
        date=today,
        insight_text=insight_text,
        category=category,
        source_data_snapshot=summary,
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight


@router.post("/generate", response_model=DailyInsightOut, status_code=status.HTTP_201_CREATED)
def generate_today_insight(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    """Gera (ou regenera) o insight de hoje — sobrescreve o registro do dia em vez de duplicar."""
    return _generate_and_upsert(db, current_user)


@router.get("/daily", response_model=DailyInsightOut)
def get_daily_insight(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    today = date.today()
    existing = (
        db.query(DailyInsight)
        .filter(DailyInsight.user_id == current_user.id, DailyInsight.date == today)
        .first()
    )
    if existing:
        return existing
    return _generate_and_upsert(db, current_user)
