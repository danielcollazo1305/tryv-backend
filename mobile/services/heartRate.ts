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

export interface HeartRateReportParams {
  /** Janela deslizante terminando hoje — usado pela tela de Relatorio de FC. Ignorado se startDate/endDate forem informados. */
  days?: number;
  /** Intervalo livre ("YYYY-MM-DD") — usado pela Exportacao PDF, tem prioridade sobre days. Precisa vir junto com endDate. */
  startDate?: string;
  endDate?: string;
}

/** Sem parametros, o backend usa o default de 30 dias — a tela de Relatorio de FC continua chamando assim. A Exportacao PDF passa startDate/endDate do intervalo escolhido. */
export async function getHeartRateReport(params: HeartRateReportParams = {}): Promise<HeartRateReport> {
  const { days, startDate, endDate } = params;
  const queryParams =
    startDate && endDate ? { start_date: startDate, end_date: endDate } : days ? { days } : undefined;
  const response = await api.get<HeartRateReport>('/heart-rate/report', { params: queryParams });
  return response.data;
}
