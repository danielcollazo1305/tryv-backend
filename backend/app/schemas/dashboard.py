from datetime import date
from typing import Literal

from pydantic import BaseModel


class WeightPoint(BaseModel):
    date: date
    weight_kg: float


class TrainingDay(BaseModel):
    date: date
    intensity: int  # 0 = sem treino, 1-2 = quantidade exata, 3 = "3 ou mais"


class CalorieSummary(BaseModel):
    avg_consumed: float
    avg_goal: float | None = None
    avg_deficit: float | None = None


class HomeSummaryOut(BaseModel):
    period: str
    weight_evolution: list[WeightPoint]
    weight_change_kg: float | None = None
    training_frequency: list[TrainingDay]
    days_trained: int
    days_total: int
    calorie_summary: CalorieSummary | None = None


class TrainingFrequencyOut(BaseModel):
    """Mesmo formato de training_frequency/days_trained/days_total do
    HomeSummaryOut, exposto sozinho (sem o resto do resumo Pro) — usado por
    /dashboard/training-frequency, que e livre."""
    period: str
    training_frequency: list[TrainingDay]
    days_trained: int
    days_total: int


class TrainingStreaksOut(BaseModel):
    """Sequencia atual e melhor sequencia historica — sobre TODO o
    historico do usuario, sem limite de periodo (diferente de
    TrainingFrequencyOut, que so cobre a janela pedida e por isso nao
    consegue calcular nem a sequencia atual real quando ela atravessa o
    limite da janela, nem a melhor sequencia historica)."""
    current_streak_days: int
    best_streak_days: int


class DailyDistanceKm(BaseModel):
    date: date
    distance_km: float


class WeeklyActivityOut(BaseModel):
    """Km rodados por dia (Run.distance_meters), nao minutos ativos —
    trocado a pedido do usuario pra bater com o grafico estilo Strava do
    card 'Km rodados' da Home. So Run entra aqui (ManualActivity nao tem
    campo de distancia)."""
    daily: list[DailyDistanceKm]


class ProgressChartPoint(BaseModel):
    """Data de INICIO do bucket — o proprio dia (granularity='day') ou o
    primeiro dia da janela de 7 dias que representa (granularity='week')."""
    date: date
    value: float


class RunProgressOut(BaseModel):
    """Card de progresso da Home (aba Corrida, ver GET /dashboard/progress/run).
    As 3 estatisticas sao sempre da semana atual (ultimos 7 dias, fixo,
    igual ao 'Esta semana' do Strava); so o grafico muda com period."""
    period: Literal["weekly", "monthly"]
    granularity: Literal["day", "week"]
    chart: list[ProgressChartPoint]
    distance_km: float
    duration_minutes: float
    elevation_gain_m: float


class WorkoutProgressOut(BaseModel):
    """Mesma ideia de RunProgressOut pra aba Musculacao (GET /dashboard/progress/workout).
    Sem duracao/calorias reais (nunca capturadas em workout_sessions hoje) —
    as 3 estatisticas sao Treinos/Series/Volume, derivadas do que de fato
    existe em WorkoutSession.exercises."""
    period: Literal["weekly", "monthly"]
    granularity: Literal["day", "week"]
    chart: list[ProgressChartPoint]
    sessions_count: int
    sets_count: int
    volume_kg: float


class MetricComparison(BaseModel):
    current: float | None = None
    previous: float | None = None
    delta_absolute: float | None = None
    delta_percent: float | None = None


class MonthComparisonOut(BaseModel):
    current_month: str  # 'YYYY-MM'
    previous_month: str  # 'YYYY-MM'
    distance_km: MetricComparison
    workouts_count: MetricComparison
    avg_daily_calories: MetricComparison
    weight_change_kg: MetricComparison


class PeriodComparisonOut(BaseModel):
    """
    Mesma forma do MonthComparisonOut, mas por janela de N dias corridos em
    vez de mes civil — usado pela Exportacao PDF (7 ou 30 dias), nao pelo
    card de comparacao mensal da Home (que continua em MonthComparisonOut,
    sempre mes atual vs. anterior, intocado).
    """
    days: int
    current_start: date
    current_end: date
    previous_start: date
    previous_end: date
    distance_km: MetricComparison
    workouts_count: MetricComparison
    avg_daily_calories: MetricComparison
    weight_change_kg: MetricComparison
