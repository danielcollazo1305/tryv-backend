import calendar
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_pro_subscription
from app.core.period import parse_period_days
from app.models.manual_activity import ManualActivity
from app.models.meal import Meal
from app.models.run import Run
from app.models.user import User
from app.models.weight_log import WeightLog
from app.schemas.dashboard import (
    CalorieSummary,
    DailyActiveMinutes,
    HomeSummaryOut,
    MetricComparison,
    MonthComparisonOut,
    PeriodComparisonOut,
    TrainingDay,
    TrainingFrequencyOut,
    WeeklyActivityOut,
    WeightPoint,
)

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


def _compute_training_frequency(
    db: Session, user_id, start_date: date, end_date: date, days_total: int
) -> tuple[list[TrainingDay], int]:
    """
    Intensidade = quantidade de Run + ManualActivity no dia (0-3, "3" =
    "3 ou mais"). Extraida de get_home_summary pra ser reaproveitada por
    /dashboard/training-frequency (versao livre, sem Pro-gate) sem duplicar
    a query.
    """
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    run_counts = dict(
        db.query(func.date(Run.started_at), func.count(Run.id))
        .filter(
            Run.user_id == user_id,
            Run.started_at >= start_datetime,
            Run.started_at <= end_datetime,
        )
        .group_by(func.date(Run.started_at))
        .all()
    )
    manual_counts = dict(
        db.query(func.date(ManualActivity.performed_at), func.count(ManualActivity.id))
        .filter(
            ManualActivity.user_id == user_id,
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
    return training_frequency, len(trained_dates)


@router.get("/training-frequency", response_model=TrainingFrequencyOut)
def get_training_frequency(
    period: str = Query("30d"),
    month: str | None = Query(
        None, description="Mes civil no formato YYYY-MM — se informado, tem prioridade sobre period"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mesmo dado de training_frequency que ja existia dentro de
    /dashboard/home-summary, exposto sozinho e livre (sem Pro-gate) — a
    frequencia de treino (Run + ManualActivity) e conteudo gratuito; so o
    resto do resumo (evolucao de peso, deficit calorico) continua Pro.
    """
    start_date, end_date, days_total, period_label = _resolve_window(period, month)
    training_frequency, days_trained = _compute_training_frequency(
        db, current_user.id, start_date, end_date, days_total
    )
    return TrainingFrequencyOut(
        period=period_label,
        training_frequency=training_frequency,
        days_trained=days_trained,
        days_total=days_total,
    )


@router.get("/weekly-activity", response_model=WeeklyActivityOut)
def get_weekly_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Minutos ativos por dia (Run.duration_seconds/60 + ManualActivity.
    duration_minutes) dos ultimos 7 dias, hoje incluso — livre, sem
    Pro-gate. Metrica escolhida em vez de calorias/distancia porque e o
    unico campo presente em 100% dos registros de ambas as tabelas
    (calories_burned e nullable nas duas; distance so existe em Run).
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    run_seconds = dict(
        db.query(func.date(Run.started_at), func.sum(Run.duration_seconds))
        .filter(
            Run.user_id == current_user.id,
            Run.started_at >= start_datetime,
            Run.started_at <= end_datetime,
        )
        .group_by(func.date(Run.started_at))
        .all()
    )
    manual_minutes = dict(
        db.query(func.date(ManualActivity.performed_at), func.sum(ManualActivity.duration_minutes))
        .filter(
            ManualActivity.user_id == current_user.id,
            ManualActivity.performed_at >= start_datetime,
            ManualActivity.performed_at <= end_datetime,
        )
        .group_by(func.date(ManualActivity.performed_at))
        .all()
    )

    daily = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        minutes = (run_seconds.get(day, 0) or 0) / 60 + (manual_minutes.get(day, 0) or 0)
        daily.append(DailyActiveMinutes(date=day, minutes=round(minutes, 1)))

    return WeeklyActivityOut(daily=daily)


@router.get("/home-summary", response_model=HomeSummaryOut)
def get_home_summary(
    period: str = Query("30d"),
    month: str | None = Query(
        None, description="Mes civil no formato YYYY-MM — se informado, tem prioridade sobre period"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    start_date, end_date, days_total, period_label = _resolve_window(period, month)

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

    training_frequency, days_trained = _compute_training_frequency(
        db, current_user.id, start_date, end_date, days_total
    )

    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

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
        days_trained=days_trained,
        days_total=days_total,
        calorie_summary=calorie_summary,
    )


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _shift_month(year: int, month: int, delta_months: int) -> tuple[int, int]:
    total = year * 12 + (month - 1) + delta_months
    return total // 12, total % 12 + 1


def _compute_period_metrics(db: Session, user_id, start_date: date, end_date: date) -> dict:
    """
    As mesmas 4 metricas, calculadas com as mesmas queries de
    get_home_summary, pra uma janela arbitraria de datas — compartilhada
    por get_month_comparison (janela = mes civil) e get_period_comparison
    (janela = N dias corridos). Chamada duas vezes por essas rotas (periodo
    atual, periodo anterior) em vez de uma.

    distance_km e workouts_count ficam 0 quando nao ha dado (zero km /
    zero treinos e um valor real, nao "sem dado"). avg_daily_calories e
    weight_change_kg ficam None quando nao da pra calcular de verdade
    (nenhuma refeicao registrada, ou menos de 2 registros de peso no mes) —
    ai sim e "sem dado", nao zero.
    """
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    distance_meters = (
        db.query(func.sum(Run.distance_meters))
        .filter(Run.user_id == user_id, Run.started_at >= start_datetime, Run.started_at <= end_datetime)
        .scalar()
        or 0.0
    )

    run_count = (
        db.query(func.count(Run.id))
        .filter(Run.user_id == user_id, Run.started_at >= start_datetime, Run.started_at <= end_datetime)
        .scalar()
        or 0
    )
    manual_count = (
        db.query(func.count(ManualActivity.id))
        .filter(
            ManualActivity.user_id == user_id,
            ManualActivity.performed_at >= start_datetime,
            ManualActivity.performed_at <= end_datetime,
        )
        .scalar()
        or 0
    )

    meal_rows = (
        db.query(func.date(Meal.logged_at).label("day"), func.sum(Meal.calories).label("total"))
        .filter(
            Meal.user_id == user_id,
            Meal.logged_at >= start_datetime,
            Meal.logged_at <= end_datetime,
            Meal.calories.isnot(None),
        )
        .group_by(func.date(Meal.logged_at))
        .all()
    )
    avg_daily_calories = (
        round(sum(row.total for row in meal_rows) / len(meal_rows), 1) if meal_rows else None
    )

    weight_rows = (
        db.query(WeightLog)
        .filter(WeightLog.user_id == user_id, WeightLog.logged_at >= start_date, WeightLog.logged_at <= end_date)
        .order_by(WeightLog.logged_at.asc())
        .all()
    )
    weight_change_kg = None
    if len(weight_rows) >= 2:
        weight_change_kg = round(float(weight_rows[-1].weight_kg) - float(weight_rows[0].weight_kg), 2)

    return {
        "distance_km": round(distance_meters / 1000, 2),
        "workouts_count": float(run_count + manual_count),
        "avg_daily_calories": avg_daily_calories,
        "weight_change_kg": weight_change_kg,
    }


def _metric_comparison(current: float | None, previous: float | None) -> MetricComparison:
    """
    delta_percent fica None (em vez de erro/divisao por zero) quando a base
    de comparacao nao existe: mes anterior sem dado nenhum (previous=None)
    ou mes anterior com valor exatamente 0 — nesse ultimo caso o
    delta_absolute ainda aparece (ex: foi de 0km pra 12km e informativo),
    mas um "%" calculado a partir de uma base zero seria infinito/enganoso.
    """
    if current is None or previous is None:
        return MetricComparison(current=current, previous=previous)

    delta_absolute = round(current - previous, 2)
    delta_percent = round((delta_absolute / abs(previous)) * 100, 1) if previous != 0 else None
    return MetricComparison(
        current=current,
        previous=previous,
        delta_absolute=delta_absolute,
        delta_percent=delta_percent,
    )


@router.get("/month-comparison", response_model=MonthComparisonOut)
def get_month_comparison(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    """Mes civil atual vs. mes civil anterior, sempre — sem navegacao (isso
    ja existe em /home-summary via ?month=)."""
    today = date.today()
    current_start, current_end = _month_bounds(today.year, today.month)
    previous_year, previous_month = _shift_month(today.year, today.month, -1)
    previous_start, previous_end = _month_bounds(previous_year, previous_month)

    current_metrics = _compute_period_metrics(db, current_user.id, current_start, current_end)
    previous_metrics = _compute_period_metrics(db, current_user.id, previous_start, previous_end)

    return MonthComparisonOut(
        current_month=f"{today.year:04d}-{today.month:02d}",
        previous_month=f"{previous_year:04d}-{previous_month:02d}",
        distance_km=_metric_comparison(current_metrics["distance_km"], previous_metrics["distance_km"]),
        workouts_count=_metric_comparison(current_metrics["workouts_count"], previous_metrics["workouts_count"]),
        avg_daily_calories=_metric_comparison(
            current_metrics["avg_daily_calories"], previous_metrics["avg_daily_calories"]
        ),
        weight_change_kg=_metric_comparison(
            current_metrics["weight_change_kg"], previous_metrics["weight_change_kg"]
        ),
    )


@router.get("/period-comparison", response_model=PeriodComparisonOut)
def get_period_comparison(
    days: int = Query(30, ge=1, le=90, description="Tamanho da janela em dias — 7 ou 30, usado pela Exportacao PDF"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    """
    Ultimos N dias vs. os N dias imediatamente anteriores a esses — mesma
    logica/queries de get_month_comparison (_compute_period_metrics,
    _metric_comparison), so trocando "mes civil" por "N dias corridos".
    Nao mexe em get_month_comparison, que continua exclusivamente mes atual
    vs. anterior pro card da Home.
    """
    current_end = date.today()
    current_start = current_end - timedelta(days=days - 1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)

    current_metrics = _compute_period_metrics(db, current_user.id, current_start, current_end)
    previous_metrics = _compute_period_metrics(db, current_user.id, previous_start, previous_end)

    return PeriodComparisonOut(
        days=days,
        current_start=current_start,
        current_end=current_end,
        previous_start=previous_start,
        previous_end=previous_end,
        distance_km=_metric_comparison(current_metrics["distance_km"], previous_metrics["distance_km"]),
        workouts_count=_metric_comparison(current_metrics["workouts_count"], previous_metrics["workouts_count"]),
        avg_daily_calories=_metric_comparison(
            current_metrics["avg_daily_calories"], previous_metrics["avg_daily_calories"]
        ),
        weight_change_kg=_metric_comparison(
            current_metrics["weight_change_kg"], previous_metrics["weight_change_kg"]
        ),
    )
