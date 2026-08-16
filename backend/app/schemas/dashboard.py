from datetime import date

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


class DailyActiveMinutes(BaseModel):
    date: date
    minutes: float


class WeeklyActivityOut(BaseModel):
    daily: list[DailyActiveMinutes]


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
