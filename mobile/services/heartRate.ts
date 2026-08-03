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
