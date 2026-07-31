from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.period import parse_period_days
from app.models.manual_activity import ManualActivity
from app.models.meal import Meal
from app.models.run import Run
from app.models.user import User
from app.models.weight_log import WeightLog
from app.schemas.dashboard import CalorieSummary, HomeSummaryOut, TrainingDay, WeightPoint

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/home-summary", response_model=HomeSummaryOut)
def get_home_summary(
    period: str = Query("30d"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    days = parse_period_days(period)
    today = date.today()
    start_date = today - timedelta(days=days - 1)  # janela de "days" dias incluindo hoje
    start_datetime = datetime.combine(start_date, datetime.min.time())

    # --- Evolucao de peso ---
    weight_rows = (
        db.query(WeightLog)
        .filter(WeightLog.user_id == current_user.id, WeightLog.logged_at >= start_date)
        .order_by(WeightLog.logged_at.asc())
        .all()
    )
    weight_evolution = [WeightPoint(date=row.logged_at, weight_kg=float(row.weight_kg)) for row in weight_rows]
    weight_change_kg = None
    if len(weight_evolution) >= 2:
        weight_change_kg = round(weight_evolution[-1].weight_kg - weight_evolution[0].weight_kg, 2)

    # --- Frequencia de treino: intensidade = quantidade de Run + ManualActivity no dia (0-3, "3" = "3 ou mais") ---
    run_counts = dict(
        db.query(func.date(Run.started_at), func.count(Run.id))
        .filter(Run.user_id == current_user.id, Run.started_at >= start_datetime)
        .group_by(func.date(Run.started_at))
        .all()
    )
    manual_counts = dict(
        db.query(func.date(ManualActivity.performed_at), func.count(ManualActivity.id))
        .filter(ManualActivity.user_id == current_user.id, ManualActivity.performed_at >= start_datetime)
        .group_by(func.date(ManualActivity.performed_at))
        .all()
    )
    trained_dates = set(run_counts) | set(manual_counts)

    def _intensity(day: date) -> int:
        return min(run_counts.get(day, 0) + manual_counts.get(day, 0), 3)

    training_frequency = [
        TrainingDay(date=start_date + timedelta(days=offset), intensity=_intensity(start_date + timedelta(days=offset)))
        for offset in range(days)
    ]

    # --- Resumo calorico: media diaria consumida (refeicoes) vs meta, se houver ---
    meal_rows = (
        db.query(func.date(Meal.logged_at).label("day"), func.sum(Meal.calories).label("total"))
        .filter(Meal.user_id == current_user.id, Meal.logged_at >= start_datetime, Meal.calories.isnot(None))
        .group_by(func.date(Meal.logged_at))
        .all()
    )
    avg_consumed = (sum(row.total for row in meal_rows) / len(meal_rows)) if meal_rows else 0.0

    calorie_summary = CalorieSummary(avg_consumed=round(avg_consumed, 1))
    if current_user.daily_calorie_goal is not None:
        calorie_summary.avg_goal = current_user.daily_calorie_goal
        calorie_summary.avg_deficit = round(current_user.daily_calorie_goal - avg_consumed, 1)

    return HomeSummaryOut(
        period=period,
        weight_evolution=weight_evolution,
        weight_change_kg=weight_change_kg,
        training_frequency=training_frequency,
        days_trained=len(trained_dates),
        days_total=days,
        calorie_summary=calorie_summary,
    )
