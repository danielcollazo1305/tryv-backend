import calendar
import uuid
from datetime import date, datetime, timedelta
from typing import Literal

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
from app.models.workout import WorkoutPlan, WorkoutSession
from app.schemas.dashboard import (
    CalorieSummary,
    DailyDistanceKm,
    HomeSummaryOut,
    MetricComparison,
    MonthComparisonOut,
    PeriodComparisonOut,
    ProgressChartPoint,
    RunProgressOut,
    TrainingDay,
    TrainingFrequencyOut,
    WeeklyActivityOut,
    WeightPoint,
    WorkoutProgressOut,
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


def _parse_and_validate_user_id(user_id: str, db: Session) -> uuid.UUID:
    """Mesmo padrao de _parse_user_id em routers/social.py — 404 tanto pra id invalido quanto pra usuario inexistente, sem distinguir os dois casos."""
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    if not db.query(User).filter(User.id == parsed_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    return parsed_id


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


@router.get("/training-frequency/{user_id}", response_model=TrainingFrequencyOut)
def get_user_training_frequency(
    user_id: str,
    period: str = Query("30d"),
    month: str | None = Query(
        None, description="Mes civil no formato YYYY-MM — se informado, tem prioridade sobre period"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Versao publica de /dashboard/training-frequency — mesma decisao de visibilidade de get_user_weekly_activity (sem gate de seguidor)."""
    parsed_id = _parse_and_validate_user_id(user_id, db)
    start_date, end_date, days_total, period_label = _resolve_window(period, month)
    training_frequency, days_trained = _compute_training_frequency(db, parsed_id, start_date, end_date, days_total)
    return TrainingFrequencyOut(
        period=period_label,
        training_frequency=training_frequency,
        days_trained=days_trained,
        days_total=days_total,
    )


def _compute_weekly_activity(db: Session, user_id) -> list[DailyDistanceKm]:
    """
    Km rodados por dia (Run.distance_meters / 1000) dos ultimos 7 dias,
    hoje incluso. Trocado de "minutos ativos" pra km a pedido do usuario
    (grafico estilo Strava, so corrida). So Run entra aqui — ManualActivity
    nao tem campo de distancia, entao dias com so atividade manual aparecem
    como 0km (esperado: esse grafico e especificamente de corrida/distancia,
    nao de atividade geral — pra isso ver TrainingFrequencyCard).

    Extraida de get_weekly_activity pra ser reaproveitada por
    get_user_weekly_activity (perfil publico de outra pessoa).
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    run_distance = dict(
        db.query(func.date(Run.started_at), func.sum(Run.distance_meters))
        .filter(
            Run.user_id == user_id,
            Run.started_at >= start_datetime,
            Run.started_at <= end_datetime,
        )
        .group_by(func.date(Run.started_at))
        .all()
    )

    daily = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        meters = run_distance.get(day, 0) or 0
        daily.append(DailyDistanceKm(date=day, distance_km=round(meters / 1000, 1)))
    return daily


@router.get("/weekly-activity", response_model=WeeklyActivityOut)
def get_weekly_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Livre, sem Pro-gate — ver _compute_weekly_activity pro calculo."""
    return WeeklyActivityOut(daily=_compute_weekly_activity(db, current_user.id))


@router.get("/weekly-activity/{user_id}", response_model=WeeklyActivityOut)
def get_user_weekly_activity(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Versao publica de /dashboard/weekly-activity pro perfil de outra
    pessoa (social/[userId].tsx). Decisao ja tomada (nao desta tarefa em
    diante, revisitar so com o usuario): visivel por padrao pra qualquer
    usuario logado, sem checar se segue o alvo — diferente da regra de
    posts do item 1. current_user aqui so exige estar autenticado, nao
    escopa o dado retornado.
    """
    parsed_id = _parse_and_validate_user_id(user_id, db)
    return WeeklyActivityOut(daily=_compute_weekly_activity(db, parsed_id))


# Ganho de elevacao — limiar minimo de variacao pra contar como subida de
# verdade (dead-band simples), pra nao inflar o total com ruido do GPS
# (altitude de celular oscila alguns metros mesmo parado). Nao e um filtro
# sofisticado (tipo suavizacao/media movel), so o suficiente pra evitar que
# jitter puro vire "ganho de elevacao" — validar com dado real de device
# depois se precisar refinar.
_ELEVATION_GAIN_THRESHOLD_M = 1.0


def _elevation_gain_meters(route_points: list[dict] | None) -> float:
    """
    Soma so as subidas (delta positivo acima do limiar) entre pontos
    consecutivos com altitude presente. alt ausente (rota gravada antes da
    captura de altitude existir, ou ponto sem leitura de altitude do GPS)
    quebra a sequencia em vez de contar como salto de/pra 0.
    """
    if not route_points:
        return 0.0
    gain = 0.0
    prev_alt = None
    for point in route_points:
        alt = point.get("alt") if isinstance(point, dict) else None
        if alt is None:
            prev_alt = None
            continue
        if prev_alt is not None:
            delta = alt - prev_alt
            if abs(delta) >= _ELEVATION_GAIN_THRESHOLD_M:
                if delta > 0:
                    gain += delta
                prev_alt = alt
            # delta pequeno (ruido): mantem prev_alt como estava
        else:
            prev_alt = alt
    return gain


def _compute_run_this_week(db: Session, user_id) -> tuple[float, float, float]:
    """(distance_km, duration_minutes, elevation_gain_m) somados dos ultimos 7 dias (hoje incluso), fixo — nao muda com o toggle Semanal/Mensal do card."""
    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    runs = (
        db.query(Run)
        .filter(Run.user_id == user_id, Run.started_at >= start_datetime, Run.started_at <= end_datetime)
        .all()
    )
    distance_km = round(sum(r.distance_meters for r in runs) / 1000, 2)
    duration_minutes = round(sum(r.duration_seconds for r in runs) / 60, 1)
    elevation_gain_m = round(sum(_elevation_gain_meters(r.route_points) for r in runs), 1)
    return distance_km, duration_minutes, elevation_gain_m


def _compute_run_chart(db: Session, user_id, granularity: Literal["day", "week"]) -> list[ProgressChartPoint]:
    """
    Picos diarios (7 pontos) ou semanais (12 pontos, janelas de 7 dias
    corridas terminando hoje) de km rodados — generaliza
    _compute_weekly_activity pra tambem cobrir a janela de 12 semanas do
    toggle Mensal, sem duplicar a query.
    """
    bucket_count, bucket_days = (7, 1) if granularity == "day" else (12, 7)
    end_date = date.today()
    start_date = end_date - timedelta(days=bucket_count * bucket_days - 1)
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    run_distance = dict(
        db.query(func.date(Run.started_at), func.sum(Run.distance_meters))
        .filter(Run.user_id == user_id, Run.started_at >= start_datetime, Run.started_at <= end_datetime)
        .group_by(func.date(Run.started_at))
        .all()
    )

    points = []
    for bucket in range(bucket_count):
        bucket_start = start_date + timedelta(days=bucket * bucket_days)
        meters = sum(run_distance.get(bucket_start + timedelta(days=d), 0) or 0 for d in range(bucket_days))
        points.append(ProgressChartPoint(date=bucket_start, value=round(meters / 1000, 1)))
    return points


@router.get("/progress/run", response_model=RunProgressOut)
def get_run_progress(
    period: Literal["weekly", "monthly"] = Query("weekly"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Card de progresso da Home (aba Corrida) — 3 estatisticas fixas da
    semana atual (Distancia/Tempo/Ganho de elevacao) + grafico que muda com
    o toggle Semanal (picos diarios, 7 dias) / Mensal (picos semanais, 12
    semanas). Livre, sem Pro-gate (mesmo padrao de weekly-activity/
    training-frequency).
    """
    distance_km, duration_minutes, elevation_gain_m = _compute_run_this_week(db, current_user.id)
    granularity: Literal["day", "week"] = "day" if period == "weekly" else "week"
    return RunProgressOut(
        period=period,
        granularity=granularity,
        chart=_compute_run_chart(db, current_user.id, granularity),
        distance_km=distance_km,
        duration_minutes=duration_minutes,
        elevation_gain_m=elevation_gain_m,
    )


def _session_stats(session: WorkoutSession) -> tuple[int, float]:
    """
    (series_completas, volume_kg) de uma sessao — deriva do JSON livre
    exercises (day/focus/exercises[].sets[].{weight_kg,reps,completed}),
    unica fonte de dado real hoje (duration_minutes/calories_burned da
    sessao existem como coluna mas nunca sao preenchidos por nenhum fluxo
    do app, ver investigacao). Volume so soma series completas com peso E
    reps preenchidos.
    """
    exercises = (session.exercises or {}).get("exercises") or []
    sets_count = 0
    volume_kg = 0.0
    for exercise in exercises:
        for set_log in exercise.get("sets") or []:
            if not set_log.get("completed"):
                continue
            sets_count += 1
            weight = set_log.get("weight_kg")
            reps = set_log.get("reps")
            if weight is not None and reps is not None:
                volume_kg += weight * reps
    return sets_count, volume_kg


def _query_workout_sessions(db: Session, user_id, start_datetime: datetime, end_datetime: datetime) -> list[WorkoutSession]:
    """WorkoutSession nao tem user_id proprio — precisa passar por WorkoutPlan (mesmo join usado em qualquer outra query de sessao por usuario)."""
    return (
        db.query(WorkoutSession)
        .join(WorkoutPlan, WorkoutSession.plan_id == WorkoutPlan.id)
        .filter(
            WorkoutPlan.user_id == user_id,
            WorkoutSession.completed_at >= start_datetime,
            WorkoutSession.completed_at <= end_datetime,
        )
        .all()
    )


def _compute_workout_this_week(db: Session, user_id) -> tuple[int, int, float]:
    """(treinos, series_completas, volume_kg) dos ultimos 7 dias (hoje incluso), fixo — nao muda com o toggle."""
    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    sessions = _query_workout_sessions(
        db, user_id, datetime.combine(start_date, datetime.min.time()), datetime.combine(end_date, datetime.max.time())
    )
    sets_count = 0
    volume_kg = 0.0
    for session in sessions:
        s, v = _session_stats(session)
        sets_count += s
        volume_kg += v
    return len(sessions), sets_count, round(volume_kg, 1)


def _compute_workout_chart(db: Session, user_id, granularity: Literal["day", "week"]) -> list[ProgressChartPoint]:
    """Mesma janela/bucket de _compute_run_chart, so que o valor por bucket e volume_kg (soma das series completas do dia) em vez de km."""
    bucket_count, bucket_days = (7, 1) if granularity == "day" else (12, 7)
    end_date = date.today()
    start_date = end_date - timedelta(days=bucket_count * bucket_days - 1)
    sessions = _query_workout_sessions(
        db, user_id, datetime.combine(start_date, datetime.min.time()), datetime.combine(end_date, datetime.max.time())
    )

    volume_by_day: dict[date, float] = {}
    for session in sessions:
        _, volume = _session_stats(session)
        day = session.completed_at.date()
        volume_by_day[day] = volume_by_day.get(day, 0.0) + volume

    points = []
    for bucket in range(bucket_count):
        bucket_start = start_date + timedelta(days=bucket * bucket_days)
        total = sum(volume_by_day.get(bucket_start + timedelta(days=d), 0.0) for d in range(bucket_days))
        points.append(ProgressChartPoint(date=bucket_start, value=round(total, 1)))
    return points


@router.get("/progress/workout", response_model=WorkoutProgressOut)
def get_workout_progress(
    period: Literal["weekly", "monthly"] = Query("weekly"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mesma ideia de get_run_progress pra aba Musculacao. Sem Tempo/Calorias
    reais (workout_sessions.duration_minutes/calories_burned existem como
    coluna mas nenhum fluxo do app preenche isso hoje — falta um cronometro
    na tela de treino) — as 3 estatisticas viraram Treinos/Series/Volume,
    tudo derivado do que de fato e gravado em WorkoutSession.exercises.
    """
    sessions_count, sets_count, volume_kg = _compute_workout_this_week(db, current_user.id)
    granularity: Literal["day", "week"] = "day" if period == "weekly" else "week"
    return WorkoutProgressOut(
        period=period,
        granularity=granularity,
        chart=_compute_workout_chart(db, current_user.id, granularity),
        sessions_count=sessions_count,
        sets_count=sets_count,
        volume_kg=volume_kg,
    )


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
