import { api } from '@/services/api';

export type HeartRateSource = 'healthkit' | 'googlefit' | 'fitbit' | 'garmin';

export interface HeartRateSampleItem {
  bpm: number;
  recorded_at: string;
}

export interface HeartRateSyncPayload {
  source: HeartRateSource;
  samples: HeartRateSampleItem[];
}

export async function syncHeartRateSamples(payload: HeartRateSyncPayload): Promise<void> {
  await api.post('/heart-rate/sync', payload);
}

export interface DailyHeartRatePoint {
  date: string;
  avg_bpm: number;
  min_bpm: number;
  max_bpm: number;
}

export interface RestingHeartRateEstimate {
  bpm: number | null;
  is_estimated: boolean;
  note: string;
}

export interface HeartRateReport {
  period_days: number;
  daily: DailyHeartRatePoint[];
  avg_bpm: number | null;
  max_bpm: number | null;
  resting_estimate: RestingHeartRateEstimate;
}

/** Sem "days", o backend usa o default de 30 — a tela de Relatorio de FC continua chamando assim. A Exportacao PDF passa 7 ou 30 explicitamente. */
export async function getHeartRateReport(days?: 7 | 30): Promise<HeartRateReport> {
  const response = await api.get<HeartRateReport>('/heart-rate/report', { params: days ? { days } : undefined });
  return response.data;
}
