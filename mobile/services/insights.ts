import { AI_TIMEOUT_INSIGHT_MS } from '@/constants/aiTimeouts';
import { api } from '@/services/api';
import { singleFlight } from '@/utils/singleFlight';

export type InsightCategory = 'nutrition' | 'training' | 'recovery' | 'general';

export interface DailyInsight {
  id: string;
  user_id: string;
  date: string;
  insight_text: string;
  category: InsightCategory;
  created_at: string;
}

const fetchDailyInsight = singleFlight(async (): Promise<DailyInsight> => {
  const response = await api.get<DailyInsight>('/insights/daily', { timeout: AI_TIMEOUT_INSIGHT_MS });
  return response.data;
});

/**
 * Pode gerar via IA na primeira chamada do dia — timeout de insight em constants/aiTimeouts.ts. TRAVA de "em andamento": a Home chama isto a cada foco da
 * aba, e com a geracao levando ate ~1 minuto uma segunda chamada disparava OUTRA geracao de IA em paralelo (custo dobrado e uma sobrescrevendo a outra).
 * Enquanto uma chamada esta pendente, as demais recebem a mesma resposta (utils/singleFlight.ts).
 */
export function getDailyInsight(): Promise<DailyInsight> {
  return fetchDailyInsight();
}
