import { api } from '@/services/api';

export interface WeightPoint {
  date: string;
  weight_kg: number;
}

export interface TrainingDay {
  date: string;
  /** 0 = sem treino, 1-2 = quantidade exata, 3 = "3 ou mais". */
  intensity: number;
}

export interface CalorieSummary {
  avg_consumed: number;
  avg_goal: number | null;
  avg_deficit: number | null;
}

export interface HomeSummary {
  period: string;
  weight_evolution: WeightPoint[];
  weight_change_kg: number | null;
  training_frequency: TrainingDay[];
  days_trained: number;
  days_total: number;
  calorie_summary: CalorieSummary | null;
}

export interface HomeSummaryParams {
  /** "Nd" (ex: "30d") — janela deslizante terminando hoje. Ignorado se "month" for informado. */
  period?: string;
  /** Mes civil no formato "YYYY-MM" — tem prioridade sobre "period" quando informado. */
  month?: string;
}

export async function getHomeSummary(params: HomeSummaryParams = { period: '30d' }): Promise<HomeSummary> {
  const response = await api.get<HomeSummary>('/dashboard/home-summary', { params });
  return response.data;
}

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  delta_absolute: number | null;
  delta_percent: number | null;
}

export interface MonthComparison {
  current_month: string;
  previous_month: string;
  distance_km: MetricComparison;
  workouts_count: MetricComparison;
  avg_daily_calories: MetricComparison;
  weight_change_kg: MetricComparison;
}

export async function getMonthComparison(): Promise<MonthComparison> {
  const response = await api.get<MonthComparison>('/dashboard/month-comparison');
  return response.data;
}

export interface PeriodComparison {
  days: number;
  current_start: string;
  current_end: string;
  previous_start: string;
  previous_end: string;
  distance_km: MetricComparison;
  workouts_count: MetricComparison;
  avg_daily_calories: MetricComparison;
  weight_change_kg: MetricComparison;
}

/** Ultimos N dias vs. os N dias anteriores a esses — usado pela Exportacao PDF, nao pelo card de comparacao mensal da Home (que continua em getMonthComparison). */
export async function getPeriodComparison(days: 7 | 30): Promise<PeriodComparison> {
  const response = await api.get<PeriodComparison>('/dashboard/period-comparison', { params: { days } });
  return response.data;
}

/** O backend manda "logged_at"/"date" como data pura ("YYYY-MM-DD"), sem horario nem fuso. */
export function parseLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

export function formatShortDate(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
