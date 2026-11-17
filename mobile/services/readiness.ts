import { api } from '@/services/api';

export interface Readiness {
  date: string;
  sleep_score: number | null;
  load_score: number | null;
  hr_score: number | null;
  final_score: number;
  /** Carga dos 7 dias ANTERIORES a hoje (sem hoje); a base da manha da Vitalidade dinamica usa este valor. Backend antigo nao manda (undefined). */
  load_score_prior?: number | null;
  recommendation_text: string | null;
}

/**
 * sleepQuality (0-100, calculada no aparelho) tem prioridade no backend; sleepHours (so horas) e o fallback para quando nao ha qualidade. Os dois
 * null/undefined = nao envia nada (backend redistribui o peso do sono entre carga e FC). So esse numero (e as horas) saem do aparelho.
 */
export async function getTodayReadiness(sleepHours?: number | null, sleepQuality?: number | null): Promise<Readiness> {
  const params: { sleep_hours?: number; sleep_quality?: number } = {};
  if (sleepQuality != null && Number.isFinite(sleepQuality)) params.sleep_quality = Math.max(0, Math.min(100, sleepQuality));
  if (sleepHours != null) params.sleep_hours = sleepHours;
  const response = await api.get<Readiness>('/readiness/today', { params });
  return response.data;
}
