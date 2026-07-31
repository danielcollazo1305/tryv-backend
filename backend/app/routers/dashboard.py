import calendar
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
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


def _resolve_window(period: str, month: str | None) -> tuple[date, date, int, str]:
    """
    Retorna (start_date, end_date, dias_totais, rotulo) da janela pedida.
    'month' (formato 'YYYY-MM'), se informado, tem prioridade sobre 'period'
    e usa o mes civil inteiro (dia 1 ao ultimo dia do mes). Sem 'month',
    mantem o comportamento original: janela deslizante de N dias terminando
    hoje (compatibilidade com o que ja existia).
    """
    if month:
        try:
            year_str, month_str = month.split("-")
            year, month_num = int(year_str), int(month_str)
            start_date = date(year, month_num, 1)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="month deve estar no formato YYYY-MM",
            )
        last_day = calendar.monthrange(year, month_num)[1]
        end_date = date(year, month_num, last_day)
        return start_date, end_date, last_day, month

    days = parse_period_days(period)
    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)
    return start_date, end_date, days, period


@router.get("/home-summary", response_model=HomeSummaryOut)
def get_home_summary(
    period: str = Query("30d"),
    month: str | None = Query(
        None, description="Mes civil no formato YYYY-MM — se informado, tem prioridade sobre period"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_date, end_date, days_total, period_label = _resolve_window(period, month)
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    # --- Evolucao de peso ---
    weight_rows = (
        db.query(WeightLog)
        .filter(
            WeightLog.user_id == current_user.id,
            WeightLog.logged_at >= start_date,
            WeightLog.logged_at <= end_date,
        )
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
        .filter(
            Run.user_id == current_user.id,
            Run.started_at >= start_datetime,
            Run.started_at <= end_datetime,
        )
        .group_by(func.date(Run.started_at))
        .all()
    )
    manual_counts = dict(
        db.query(func.date(ManualActivity.performed_at), func.count(ManualActivity.id))
        .filter(
            ManualActivity.user_id == current_user.id,
            ManualActivity.performed_at >= start_datetime,
            ManualActivity.performed_at <= end_datetime,
        )
        .group_by(func.date(ManualActivity.performed_at))
        .all()
    )
    trained_dates = set(run_counts) | set(manual_counts)

    def _intensity(day: date) -> int:
        return min(run_counts.get(day, 0) + manual_counts.get(day, 0), 3)

    training_frequency = [
        TrainingDay(date=start_date + timedelta(days=offset), intensity=_intensity(start_date + timedelta(days=offset)))
        for offset in range(days_total)
    ]

    # --- Resumo calorico: media diaria consumida (refeicoes) vs meta, se houver ---
    meal_rows = (
        db.query(func.date(Meal.logged_at).label("day"), func.sum(Meal.calories).label("total"))
        .filter(
            Meal.user_id == current_user.id,
            Meal.logged_at >= start_datetime,
            Meal.logged_at <= end_datetime,
            Meal.calories.isnot(None),
        )
        .group_by(func.date(Meal.logged_at))
        .all()
    )
    avg_consumed = (sum(row.total for row in meal_rows) / len(meal_rows)) if meal_rows else 0.0

    calorie_summary = CalorieSummary(avg_consumed=round(avg_consumed, 1))
    if current_user.daily_calorie_goal is not None:
        calorie_summary.avg_goal = current_user.daily_calorie_goal
        calorie_summary.avg_deficit = round(current_user.daily_calorie_goal - avg_consumed, 1)

    return HomeSummaryOut(
        period=period_label,
        weight_evolution=weight_evolution,
        weight_change_kg=weight_change_kg,
        training_frequency=training_frequency,
        days_trained=len(trained_dates),
        days_total=days_total,
        calorie_summary=calorie_summary,
    )
