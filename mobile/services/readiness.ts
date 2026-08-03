import { api } from '@/services/api';

export interface Readiness {
  date: string;
  sleep_score: number | null;
  load_score: number | null;
  hr_score: number | null;
  final_score: number;
  recommendation_text: string | null;
}

/** sleepHours null/undefined = nao envia o parametro (backend redistribui o peso do sono entre carga e FC). */
export async function getTodayReadiness(sleepHours?: number | null): Promise<Readiness> {
  const params = sleepHours != null ? { sleep_hours: sleepHours } : {};
  const response = await api.get<Readiness>('/readiness/today', { params });
  return response.data;
}
