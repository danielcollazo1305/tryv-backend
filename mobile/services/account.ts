import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { FREE_DRAFT_STORAGE_KEY } from '@/context/WorkoutSessionDraftContext';
import { api } from '@/services/api';
import { LAST_SYNC_KEY as HEART_RATE_LAST_SYNC_KEY } from '@/services/heartRateSync';
import { ANCHOR_KEY as AUTO_IMPORT_ANCHOR_KEY, LAST_RUN_KEY as AUTO_IMPORT_LAST_RUN_KEY } from '@/services/workoutAutoImport';

export * from '@/services/accountErrors';

/**
 * Exclusao de conta IMEDIATA e irreversivel (POST /users/me/delete, 204). O backend confere a senha e a palavra
 * EXCLUIR. O 401 de "Senha incorreta" NAO desloga: o cliente de API (services/api.ts) nao tem interceptor de resposta,
 * entao nada reage a 401 sozinho; quem decide e a tela, via classifyDeleteAccountError. Timeout de 60 s (o padrao de 15 s
 * e curto: o servidor cancela a assinatura no Stripe antes de apagar).
 */
export async function deleteMyAccount(password: string, confirmation: string): Promise<void> {
  await api.post('/users/me/delete', { password, confirmation: confirmation.trim() }, { timeout: 60000 });
}

/**
 * Limpa o que o app guarda NO APARELHO ligado a conta que acabou de ser apagada (o token e o usuario em memoria saem
 * pelo logout do AuthContext). Cada item e independente e best-effort. Devolve as chaves removidas (para diagnostico).
 *
 *  - AsyncStorage 'workout-session-draft-free-v1': rascunho do treino livre em andamento (dados da pessoa).
 *  - AsyncStorage 'workout_auto_import_anchor_v1' / '..._last_run_v1': ancora e diagnostico da importacao automatica de
 *    treinos; se ficassem, uma conta nova no mesmo aparelho NAO reimportaria os treinos anteriores a ancora.
 *  - SecureStore 'heart_rate_last_synced_at': cursor da sincronizacao de batimentos (mesmo motivo).
 *
 * NAO limpa (sao do aparelho, nao da conta): 'healthkit_connected' (a permissao do Apple Health e do aparelho e
 * continua valendo) e 'workout_auto_import_enabled_v1' (preferencia de uso do aparelho). O rascunho em MEMORIA do
 * WorkoutSessionDraftContext e zerado pela tela (setDraft(null)).
 */
export async function clearLocalAccountData(): Promise<string[]> {
  const removed: string[] = [];
  const asyncKeys = [FREE_DRAFT_STORAGE_KEY, AUTO_IMPORT_ANCHOR_KEY, AUTO_IMPORT_LAST_RUN_KEY];
  for (const key of asyncKeys) {
    try {
      await AsyncStorage.removeItem(key);
      removed.push(key);
    } catch {
      // best-effort: a conta ja foi apagada no servidor
    }
  }
  try {
    await SecureStore.deleteItemAsync(HEART_RATE_LAST_SYNC_KEY);
    removed.push(HEART_RATE_LAST_SYNC_KEY);
  } catch {
    // idem
  }
  return removed;
}
