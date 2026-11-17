// Marcadores de sincronizacao guardados NO APARELHO (ancora da importacao automatica de treinos e cursor/intervalo da sincronizacao de batimentos).
// Pertencem a conta que os gravou: no logout e na exclusao de conta precisam sair, senao outra conta no mesmo aparelho herda o marcador da anterior
// (nao reimporta treinos antigos, nao reenvia batimentos). Modulo puro (sem React Native) para ser testado com `npm test`; o acoplamento ao
// AsyncStorage/SecureStore reais fica em services/syncMarkers.ts.

/** AsyncStorage: ancora da consulta ancorada do HealthKit (importacao automatica de treinos). */
export const AUTO_IMPORT_ANCHOR_KEY = 'workout_auto_import_anchor_v1';
/** AsyncStorage: diagnostico da ultima execucao da importacao automatica. */
export const AUTO_IMPORT_LAST_RUN_KEY = 'workout_auto_import_last_run_v1';
/** SecureStore: cursor da sincronizacao de batimentos (instante da ultima amostra aceita pelo backend). */
export const HEART_RATE_LAST_SYNC_KEY = 'heart_rate_last_synced_at';
/** SecureStore: fim da ultima execucao completa da sincronizacao de batimentos (intervalo minimo entre execucoes). */
export const HEART_RATE_LAST_RUN_KEY = 'heart_rate_last_sync_run_at';

/** Lista UNICA das chaves de sincronizacao: e daqui que o logout e a exclusao de conta limpam. */
export const SYNC_MARKER_ASYNC_KEYS = [AUTO_IMPORT_ANCHOR_KEY, AUTO_IMPORT_LAST_RUN_KEY] as const;
export const SYNC_MARKER_SECURE_KEYS = [HEART_RATE_LAST_SYNC_KEY, HEART_RATE_LAST_RUN_KEY] as const;

export interface MarkerStore {
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

/**
 * Muda a cada limpeza. Uma sincronizacao em andamento captura o valor no inicio e so grava o marcador se ele ainda for o mesmo; assim ela nao
 * "ressuscita" a chave que o logout acabou de apagar (nem grava o marcador da conta anterior depois que outra entrou).
 */
let generation = 0;

export function getSyncMarkersGeneration(): number {
  return generation;
}

/** Remove as 4 chaves (so elas) e invalida gravacoes em andamento. Cada remocao e independente; falha de uma nao lanca nem impede as outras. Devolve as removidas. */
export async function clearSyncMarkersIn(asyncStore: MarkerStore, secureStore: MarkerStore): Promise<string[]> {
  generation += 1;
  const removed: string[] = [];
  const targets: Array<[MarkerStore, readonly string[]]> = [
    [asyncStore, SYNC_MARKER_ASYNC_KEYS],
    [secureStore, SYNC_MARKER_SECURE_KEYS],
  ];
  for (const [store, keys] of targets) {
    for (const key of keys) {
      try {
        await store.removeItem(key);
        removed.push(key);
      } catch {
        // best-effort: nao pode impedir o logout
      }
    }
  }
  return removed;
}

/**
 * Grava o marcador SO se nenhuma limpeza ocorreu desde `expectedGeneration`. Se a limpeza acontecer durante a propria gravacao, desfaz em seguida.
 * Devolve true se o valor ficou gravado. Falha de armazenamento lanca como no setItem original (quem chama ja trata).
 */
export async function setMarkerIfCurrent(store: MarkerStore, key: string, value: string, expectedGeneration: number): Promise<boolean> {
  if (generation !== expectedGeneration) return false;
  await store.setItem(key, value);
  if (generation !== expectedGeneration) {
    try {
      await store.removeItem(key);
    } catch {
      // idem
    }
    return false;
  }
  return true;
}
