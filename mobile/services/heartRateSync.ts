import * as SecureStore from 'expo-secure-store';

import { fetchHeartRateSamplesSince } from '@/services/health';
import { syncHeartRateSamples } from '@/services/heartRate';

/** CURSOR da sincronizacao: instante (ISO) da ultima amostra de FC que o backend ja aceitou. Chave mantida (era o "ultimo sync" antigo): quem ja tem
 * valor salvo continua dali, e a exclusao de conta (services/account.ts) segue limpando. */
export const LAST_SYNC_KEY = 'heart_rate_last_synced_at';
/** Quando a ultima execucao TERMINOU de esgotar as amostras pendentes (so serve ao intervalo minimo abaixo; separado do cursor). */
export const LAST_RUN_KEY = 'heart_rate_last_sync_run_at';
// Nao tenta de novo antes disso — evita bater no backend toda vez que a tela
// de Atividades ganha foco (ela remonta a cada navegacao, nao so uma vez).
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;
// Primeira sincronizacao (sem cursor salvo ainda): busca so o ultimo dia,
// nao o historico inteiro.
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
// Tamanho do lote = teto de fetchHeartRateSamplesSince (limit 500 em healthkit.ts; slice(0, 500) em healthConnect.ts). Lote menor que isso = acabou.
const BATCH_SIZE = 500;
// Teto de seguranca de lotes por execucao (10.000 amostras): o que sobrar sai na proxima, sem prender o app num laco longo.
const MAX_BATCHES_PER_RUN = 20;

/**
 * Sincroniza amostras de FC do HealthKit com POST /heart-rate/sync. Throttled
 * (no maximo 1x a cada 15min) e incremental: busca em LOTES de ate 500 a partir
 * do cursor e repete ate esgotar (ou bater o teto de lotes). O cursor so avanca
 * DEPOIS que o backend aceitou o lote, e vai ate o horario da ultima amostra do
 * lote — nunca para o relogio do inicio do sync, que pulava as amostras alem
 * das 500 primeiras. Reenviar a amostra da borda e inofensivo: o backend
 * deduplica por (usuario, fonte, horario). Seguro de chamar sempre que a tela
 * de Atividades carrega — falha em silencio, e um bonus pro Score de Prontidao
 * e pro Live Activity, nunca deve aparecer como erro pro usuario.
 */
export async function syncRecentHeartRate(): Promise<void> {
  const lastRunRaw = await SecureStore.getItemAsync(LAST_RUN_KEY);
  const lastRunAt = lastRunRaw ? new Date(lastRunRaw) : null;
  if (lastRunAt && Date.now() - lastRunAt.getTime() < MIN_SYNC_INTERVAL_MS) {
    return;
  }

  const cursorRaw = await SecureStore.getItemAsync(LAST_SYNC_KEY);
  const parsedCursor = cursorRaw ? new Date(cursorRaw) : null;
  let cursor = parsedCursor && !Number.isNaN(parsedCursor.getTime()) ? parsedCursor : new Date(Date.now() - DEFAULT_LOOKBACK_MS);
  const runStartedAt = new Date();

  let drained = false;
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
    const samples = await fetchHeartRateSamplesSince(cursor);
    if (samples.length === 0) {
      drained = true;
      break;
    }

    // O backend rejeita o lote inteiro se uma unica amostra sair da faixa
    // aceita (0-300 bpm) — filtra aqui pra um outlier isolado do HealthKit
    // nao bloquear o resto do lote.
    const validSamples = samples.filter((sample) => sample.bpm > 0 && sample.bpm < 300);
    if (validSamples.length > 0) {
      // Se isto lancar, o cursor NAO avanca: a proxima tentativa refaz este lote.
      await syncHeartRateSamples({
        source: 'healthkit',
        samples: validSamples.map((sample) => ({ bpm: sample.bpm, recorded_at: sample.recordedAt })),
      });
    }

    // Cursor = ultima amostra do lote (a lista vem da mais antiga para a mais nova), mesmo as descartadas por faixa: elas nunca seriam aceitas.
    const lastAt = new Date(samples[samples.length - 1].recordedAt);
    if (Number.isNaN(lastAt.getTime())) break; // horario ilegivel: nao avanca, tenta de novo depois
    // Sem progresso (lote cheio inteiro no mesmo instante do cursor): anda 1 ms para nao repetir o mesmo lote para sempre.
    cursor = lastAt.getTime() > cursor.getTime() ? lastAt : new Date(cursor.getTime() + 1);
    await SecureStore.setItemAsync(LAST_SYNC_KEY, cursor.toISOString());

    if (samples.length < BATCH_SIZE) {
      drained = true;
      break;
    }
  }

  // Intervalo de 15 min so conta quando esgotou; se parou no teto de lotes, a proxima chamada continua de onde parou.
  if (drained) {
    await SecureStore.setItemAsync(LAST_RUN_KEY, runStartedAt.toISOString());
  }
}
