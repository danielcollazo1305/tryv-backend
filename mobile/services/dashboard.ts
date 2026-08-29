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
  /** "Nd" (ex: "30d") — janela deslizante terminando hoje. Ignorado se "month" ou start_date/end_date forem informados. */
  period?: string;
  /** Mes civil no formato "YYYY-MM" — tem prioridade sobre "period", mas nao sobre start_date/end_date. */
  month?: string;
  /** Intervalo livre ("YYYY-MM-DD") — usado pela Exportacao PDF, tem prioridade sobre month/period. Precisa vir junto com end_date. */
  start_date?: string;
  end_date?: string;
}

export async function getHomeSummary(params: HomeSummaryParams = { period: '30d' }): Promise<HomeSummary> {
  const response = await api.get<HomeSummary>('/dashboard/home-summary', { params });
  return response.data;
}

export interface TrainingFrequency {
  period: string;
  training_frequency: TrainingDay[];
  days_trained: number;
  days_total: number;
}

/**
 * Mesmo dado de training_frequency de getHomeSummary, mas livre (sem
 * exigir Pro) — usado pelo card "Frequencia de treino" da Home e, com
 * userId, pela mesma secao no perfil publico de outra pessoa
 * (social/[userId].tsx) — visivel por padrao, sem checar se segue.
 */
export async function getTrainingFrequency(params: HomeSummaryParams, userId?: string): Promise<TrainingFrequency> {
  const url = userId ? `/dashboard/training-frequency/${userId}` : '/dashboard/training-frequency';
  const response = await api.get<TrainingFrequency>(url, { params });
  return response.data;
}

export interface TrainingStreaks {
  current_streak_days: number;
  best_streak_days: number;
}

/**
 * Sequencia atual e melhor sequencia historica, sobre TODO o historico do
 * usuario (sem filtro de periodo) — diferente de getTrainingFrequency, que
 * so cobre uma janela (mes/periodo) e por isso nao consegue calcular a
 * sequencia atual real quando ela atravessa o limite da janela, nem a
 * melhor sequencia historica. Usado pelo grid de consistencia do Perfil.
 */
export async function getTrainingStreaks(): Promise<TrainingStreaks> {
  const response = await api.get<TrainingStreaks>('/dashboard/training-streaks');
  return response.data;
}

export interface DailyDistanceKm {
  date: string;
  distance_km: number;
}

export interface WeeklyActivity {
  daily: DailyDistanceKm[];
}

/**
 * Km rodados (so Run) por dia, ultimos 7 dias — livre. Usado pelo grafico
 * "Km rodados" da Home e, com userId, pela mesma secao no perfil publico
 * de outra pessoa (social/[userId].tsx) — visivel por padrao, sem checar
 * se segue.
 */
export async function getWeeklyActivity(userId?: string): Promise<WeeklyActivity> {
  const url = userId ? `/dashboard/weekly-activity/${userId}` : '/dashboard/weekly-activity';
  const response = await api.get<WeeklyActivity>(url);
  return response.data;
}

export type ProgressPeriod = 'weekly' | 'monthly';
export type ProgressGranularity = 'day' | 'week';

export interface ProgressChartPoint {
  /** Data de inicio do bucket — o proprio dia (granularity='day') ou o 1o dia da janela de 7 dias que representa (granularity='week'). */
  date: string;
  value: number;
}

export interface RunProgress {
  period: ProgressPeriod;
  granularity: ProgressGranularity;
  chart: ProgressChartPoint[];
  distance_km: number;
  duration_minutes: number;
  elevation_gain_m: number;
}

/**
 * Card de progresso com abas da Home (aba Corrida) — as 3 estatisticas sao
 * sempre da semana atual (fixo), so o grafico muda com period (Semanal =
 * picos diarios dos ultimos 7 dias, Mensal = picos semanais das ultimas 12
 * semanas). Livre, sem Pro-gate.
 */
export async function getRunProgress(period: ProgressPeriod): Promise<RunProgress> {
  const response = await api.get<RunProgress>('/dashboard/progress/run', { params: { period } });
  return response.data;
}

export interface WorkoutProgress {
  period: ProgressPeriod;
  granularity: ProgressGranularity;
  chart: ProgressChartPoint[];
  sessions_count: number;
  sets_count: number;
  volume_kg: number;
}

/**
 * Mesma ideia de getRunProgress pra aba Musculacao. Sem Tempo/Calorias reais
 * (nunca capturados em workout_sessions hoje, ver investigacao) — as 3
 * estatisticas sao Treinos/Series/Volume, derivadas do que de fato e
 * gravado nas series completadas de cada sessao.
 */
export async function getWorkoutProgress(period: ProgressPeriod): Promise<WorkoutProgress> {
  const response = await api.get<WorkoutProgress>('/dashboard/progress/workout', { params: { period } });
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

/**
 * Intervalo escolhido vs. o mesmo numero de dias imediatamente anteriores
 * a ele — usado pela Exportacao PDF (seletor de datas livre, ate 90 dias),
 * nao pelo card de comparacao mensal da Home (que continua em
 * getMonthComparison). startDate/endDate no formato "YYYY-MM-DD".
 */
export async function getPeriodComparison(startDate: string, endDate: string): Promise<PeriodComparison> {
  const response = await api.get<PeriodComparison>('/dashboard/period-comparison', {
    params: { start_date: startDate, end_date: endDate },
  });
  return response.data;
}

/** O backend manda "logged_at"/"date" como data pura ("YYYY-MM-DD"), sem horario nem fuso. */
export function parseLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

export function formatShortDate(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
