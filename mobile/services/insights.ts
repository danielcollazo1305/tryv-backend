import { api } from '@/services/api';

export type InsightCategory = 'nutrition' | 'training' | 'recovery' | 'general';

export interface DailyInsight {
  id: string;
  user_id: string;
  date: string;
  insight_text: string;
  category: InsightCategory;
  created_at: string;
}

/** Pode gerar via IA na primeira chamada do dia — mesma folga de timeout usada em outras chamadas de IA. */
export async function getDailyInsight(): Promise<DailyInsight> {
  const response = await api.get<DailyInsight>('/insights/daily', { timeout: 45000 });
  return response.data;
}
