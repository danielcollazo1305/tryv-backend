import * as SecureStore from 'expo-secure-store';

import { fetchHeartRateSamplesSince } from '@/services/healthkit';
import { syncHeartRateSamples } from '@/services/heartRate';

const LAST_SYNC_KEY = 'heart_rate_last_synced_at';
// Nao tenta de novo antes disso — evita bater no backend toda vez que a tela
// de Atividades ganha foco (ela remonta a cada navegacao, nao so uma vez).
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;
// Primeira sincronizacao (sem cursor salvo ainda): busca so o ultimo dia,
// nao o historico inteiro.
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Sincroniza amostras de FC do HealthKit com POST /heart-rate/sync. Throttled
 * (no maximo 1x a cada 15min) e incremental: guarda o horario da ultima
 * sincronizacao bem-sucedida e so busca/envia amostras mais novas que isso,
 * em vez de reenviar o mesmo historico toda vez (o backend nao deduplica).
 * Seguro de chamar sempre que a tela de Atividades carrega — falha em
 * silencio, e um bonus pro Score de Prontidao e pro Live Activity, nunca
 * deve aparecer como erro pro usuario.
 */
export async function syncRecentHeartRate(): Promise<void> {
  const lastSyncedRaw = await SecureStore.getItemAsync(LAST_SYNC_KEY);
  const lastSyncedAt = lastSyncedRaw ? new Date(lastSyncedRaw) : null;

  if (lastSyncedAt && Date.now() - lastSyncedAt.getTime() < MIN_SYNC_INTERVAL_MS) {
    return;
  }

  const since = lastSyncedAt ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS);
  // Capturado antes da busca (nao depois de enviar) — se uma amostra nova
  // chegar durante a sincronizacao, prefere buscar ela de novo depois a
  // pular ela por um cursor otimista demais.
  const syncStartedAt = new Date();

  const samples = await fetchHeartRateSamplesSince(since);

  // O backend rejeita o lote inteiro se uma unica amostra sair da faixa
  // aceita (0-300 bpm) — filtra aqui pra um outlier isolado do HealthKit
  // nao bloquear o resto do lote.
  const validSamples = samples.filter((sample) => sample.bpm > 0 && sample.bpm < 300);

  if (validSamples.length > 0) {
    await syncHeartRateSamples({
      source: 'healthkit',
      samples: validSamples.map((sample) => ({ bpm: sample.bpm, recorded_at: sample.recordedAt })),
    });
  }

  // So avanca o cursor depois que tudo deu certo — se a busca no HealthKit ou
  // o envio pro backend falhar, a proxima tentativa reusa a mesma janela em
  // vez de perder essas amostras silenciosamente.
  await SecureStore.setItemAsync(LAST_SYNC_KEY, syncStartedAt.toISOString());
}
