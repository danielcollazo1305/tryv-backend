import { api } from '@/services/api';
import { parseUtcDate } from '@/services/challenges';
import { localDayNumber } from '@/utils/equipmentUsage';

export type ModalityId = 'bike' | 'halter' | 'luva' | 'tenis';

export interface ModalityStats {
  id: ModalityId;
  sessions_this_month: number;
  /** So tenis e bike (null nas outras). */
  distance_km_this_month: number | null;
  duration_minutes_this_month: number | null;
  /** UTC naive (sem fuso): use parseUtcDate (services/challenges.ts). null = nunca treinou. */
  last_session_at: string | null;
}

export interface ModalitiesResponse {
  month_start: string;
  month_end: string;
  /** Sempre as 4, na ordem bike, halter, luva, tenis. */
  modalities: ModalityStats[];
}

export async function getModalities(): Promise<ModalitiesResponse> {
  const response = await api.get<ModalitiesResponse>('/dashboard/modalities');
  return response.data;
}

/**
 * Rotulo do ultimo treino a partir de last_session_at (instante UTC naive do servidor). O dia contado e o dia
 * LOCAL do aparelho, nao o dia UTC. null = nunca treinou.
 */
export function lastSessionLabel(lastSessionAt: string | null, now: Date = new Date()): string {
  if (!lastSessionAt) return 'Nenhum ainda';
  const days = localDayNumber(now) - localDayNumber(parseUtcDate(lastSessionAt));
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}
