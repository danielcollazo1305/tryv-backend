import { AI_TIMEOUT_INSIGHT_MS } from '@/constants/aiTimeouts';
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

/** Pode gerar via IA na primeira chamada do dia — timeout de insight em constants/aiTimeouts.ts. */
export async function getDailyInsight(): Promise<DailyInsight> {
  const response = await api.get<DailyInsight>('/insights/daily', { timeout: AI_TIMEOUT_INSIGHT_MS });
  return response.data;
}
