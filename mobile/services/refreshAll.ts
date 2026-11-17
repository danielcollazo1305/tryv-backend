// Atualizar TUDO de uma vez (botao e gesto de puxar para atualizar): importa treinos do Apple Saude, sincroniza a FC, recalcula a Vitalidade e grava o resumo do
// widget (com pausa minima de 60 s entre gravacoes do widget, ver widgetSummary.ts). Uma execucao por vez (utils/singleFlight.ts); nunca lanca erro: cada etapa
// falha sozinha e as outras seguem. Nao e o "Importar treinos" de Atividades (aquele e a selecao manual treino a treino).
import { syncRecentHeartRate } from '@/services/heartRateSync';
import { refreshVitality } from '@/services/vitalityService';
import { syncWidgetSummary } from '@/services/widgetSummary';
import { runAutoImport } from '@/services/workoutAutoImport';
import { singleFlight } from '@/utils/singleFlight';

type Listener = () => void;
const listeners = new Set<Listener>();

export interface RefreshState {
  refreshing: boolean;
  /** Epoch (ms) do fim da ultima atualizacao manual completa; null = nenhuma nesta sessao. */
  lastRefreshAt: number | null;
}

let state: RefreshState = { refreshing: false, lastRefreshAt: null };

function setState(next: RefreshState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getRefreshState(): RefreshState {
  return state;
}

export function subscribeRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const run = singleFlight(async (): Promise<number> => {
  setState({ ...state, refreshing: true });
  try {
    // Treinos e FC primeiro (a prontidao e a Vitalidade dependem deles); cada um falha sozinho.
    await Promise.all([runAutoImport('foreground').catch(() => undefined), syncRecentHeartRate({ force: true }).catch(() => undefined)]);
    await refreshVitality({ force: true });
    await syncWidgetSummary({ manual: true });
  } catch {
    // as etapas ja engolem os proprios erros; isto e so uma rede de seguranca
  } finally {
    setState({ refreshing: false, lastRefreshAt: Date.now() });
  }
  return state.lastRefreshAt ?? Date.now();
});

/** Roda a atualizacao completa; se ja ha uma em andamento, espera essa mesma. Devolve o instante (ms) em que terminou. */
export function refreshEverything(): Promise<number> {
  return run();
}
