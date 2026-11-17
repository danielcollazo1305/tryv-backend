// Servico UNICO da Vitalidade dinamica: le os dados (Apple Saude no aparelho + /readiness/today), roda o motor puro (vitalityEngine.ts), guarda o estado do dia
// (AsyncStorage) e entrega o MESMO valor para todas as telas, o widget e a tela de depuracao. Nada alem do numero sleep_quality (e, como fallback, as horas
// de sono) sai do aparelho; passos, calorias, treinos e FC ficam so aqui. E uma ESTIMATIVA de bem-estar, nao medida medica.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { HEALTHKIT_CONNECTED_KEY } from '@/services/healthkit';
import { fetchLastNightSleepHours, fetchSleepQualityReading, fetchVitalityHistory, fetchVitalityToday } from '@/services/health';
import { toDateKey } from '@/services/healthkitState';
import { getTodayReadiness } from '@/services/readiness';
import type { Readiness } from '@/services/readiness';
import type { SleepQualityReading } from '@/services/sleepNights';
import type { VitalityState } from '@/services/vitality';
import { EMPTY_STORED_STATE, runVitalityEngine } from '@/services/vitalityEngine';
import type { HistoryDay, StoredVitalityState, VitalityDebug } from '@/services/vitalityEngine';
import type { DayInput } from '@/services/vitalityDynamic';

/** Chave do estado guardado (base congelada do dia, referencias, totais e ultimo valor). Limpa na exclusao de conta (services/account.ts). */
export const VITALITY_STATE_KEY = 'vitality_state_v1';
/** Atualizacoes automaticas (foco de tela, abrir o app) nao rodam de novo antes disto; o botao e o gesto de atualizar passam por cima (force). */
export const VITALITY_MIN_AUTO_INTERVAL_MS = 60 * 1000;

export interface VitalityIndicators {
  sleep: number | null;
  load: number | null;
  hr: number | null;
}

export interface DynamicVitality {
  /** 0-100 ou null (sem dados). */
  score: number | null;
  state: VitalityState;
  /** true = ainda nao ha o sono de hoje: o valor e o de ontem a noite (ou a base provisoria). */
  provisional: boolean;
  /** Epoch (ms) da ultima atualizacao calculada. */
  updatedAt: number;
  /** Componentes da base para as telas (sono = qualidade do aparelho, carga = 7 dias anteriores a hoje, FC = pilar do backend). */
  indicators: VitalityIndicators;
  /** Tudo o que entrou no calculo (tela de depuracao). */
  debug: VitalityDebug;
}

async function loadStoredState(): Promise<StoredVitalityState> {
  try {
    const raw = await AsyncStorage.getItem(VITALITY_STATE_KEY);
    if (!raw) return EMPTY_STORED_STATE;
    const parsed = JSON.parse(raw) as StoredVitalityState;
    return parsed && parsed.v === 1 ? parsed : EMPTY_STORED_STATE;
  } catch {
    return EMPTY_STORED_STATE;
  }
}

async function saveStoredState(state: StoredVitalityState): Promise<void> {
  try {
    await AsyncStorage.setItem(VITALITY_STATE_KEY, JSON.stringify(state));
  } catch {
    // sem armazenamento: o valor so nao fica guardado entre aberturas
  }
}

/** Le, calcula e guarda UMA atualizacao. Cada leitura falha sozinha (o motor trata dado ausente); so levanta erro se nem o armazenamento/estado puder ser montado. */
export async function computeDynamicVitality(): Promise<DynamicVitality> {
  const now = new Date();
  const todayKey = toDateKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);
  const stored = await loadStoredState();

  const connected = Platform.OS === 'ios' && (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';

  // Sono (so leitura do Apple Saude): qualidade calculada aqui; horas so como fallback para o backend.
  let reading: SleepQualityReading | null = null;
  let sleepHours: number | null = null;
  if (connected) {
    try {
      reading = await fetchSleepQualityReading();
    } catch {
      reading = null;
    }
    if (reading?.quality == null) {
      try {
        sleepHours = await fetchLastNightSleepHours();
      } catch {
        sleepHours = null;
      }
    }
  }

  // Backend: so o sleep_quality (ou as horas) sai do aparelho; volta a carga (com e sem hoje) e a FC.
  let readiness: Readiness | null = null;
  try {
    readiness = await getTodayReadiness(sleepHours, reading?.quality ?? null);
  } catch {
    readiness = null;
  }

  // Dados de hoje ao vivo e historico para a referencia pessoal (so se as de hoje ainda nao foram fixadas).
  let day: DayInput | null = null;
  let restHr: number | null = null;
  let history: HistoryDay[] | null = null;
  if (connected) {
    const awakeStart = reading?.isToday && reading.wakeAt ? new Date(reading.wakeAt) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [today, hist] = await Promise.all([
      fetchVitalityToday(now, awakeStart).catch(() => null),
      stored.refs && stored.refs.dayKey === todayKey ? Promise.resolve(null) : fetchVitalityHistory(now, 14).catch(() => null),
    ]);
    if (today) {
      day = today.day;
      restHr = today.restHr;
    }
    history = hist;
  }

  const out = runVitalityEngine({
    now,
    todayKey,
    yesterdayKey,
    sleep: reading ? { quality: reading.quality, confidence: reading.confidence, parts: reading.parts, isToday: reading.isToday } : null,
    readiness,
    day,
    history,
    restHr,
    stored,
    userId: activeUserId,
  });
  await saveStoredState(out.next);

  return {
    score: out.display.score,
    state: out.display.state,
    provisional: out.display.provisional,
    updatedAt: now.getTime(),
    indicators: {
      sleep: out.debug.base.sleepQuality,
      load: out.debug.base.loadPrior ?? out.debug.base.loadWithToday,
      hr: out.debug.base.hr,
    },
    debug: out.debug,
  };
}

// ----------------------------------------------------------------------------------------------------------------------- cache compartilhado
// Um unico calculo por vez e um unico resultado para todos que perguntam (Home, aba Treino, Treinar, widget): evita consultas e chamadas duplicadas ao backend.
type Listener = () => void;
const listeners = new Set<Listener>();
let current: DynamicVitality | null = null;
let failed = false;
let inFlight: Promise<DynamicVitality | null> | null = null;
let lastRunAt = 0;
/** Muda a cada reset: uma atualizacao que comecou ANTES do reset (outro usuario) nao pode depositar o resultado dela no cache de depois. */
let generation = 0;
/** Usuario atual (id no Tryv), informado pelo AuthContext; estado guardado de outro usuario e ignorado pelo motor. */
let activeUserId: string | null = null;

/** Informa quem esta logado. Se mudou de uma pessoa para outra, o cache em memoria da anterior e descartado. */
export function setVitalityUserId(userId: string | null): void {
  const changed = activeUserId != null && userId != null && activeUserId !== userId;
  activeUserId = userId;
  if (changed) resetVitalityCache();
}

/** Descarta o cache em memoria: valor, erro, intervalo minimo e (via generation) qualquer atualizacao em andamento. Avisa quem esta ouvindo. */
export function resetVitalityCache(): void {
  generation += 1;
  current = null;
  failed = false;
  lastRunAt = 0;
  publish();
}

/** Logout: apaga o estado guardado no aparelho (base congelada, referencias, totais, ultimo valor) e o cache em memoria. Nunca lanca. */
export async function clearVitalityLocalState(): Promise<void> {
  activeUserId = null;
  resetVitalityCache();
  try {
    await AsyncStorage.removeItem(VITALITY_STATE_KEY);
  } catch {
    // sem armazenamento
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export interface VitalitySnapshot {
  vitality: DynamicVitality | null;
  error: boolean;
  refreshing: boolean;
}

let snapshot: VitalitySnapshot = { vitality: null, error: false, refreshing: false };
function publish(): void {
  snapshot = { vitality: current, error: failed, refreshing: inFlight != null };
  notify();
}

export function getVitalitySnapshot(): VitalitySnapshot {
  return snapshot;
}

export function subscribeVitality(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Atualiza a Vitalidade. Sem `force`, ignora a chamada se a ultima atualizacao tem menos de 60 s; com `force` (botao, gesto de puxar) calcula agora. Se ja ha uma
 * atualizacao em andamento, devolve ESSA mesma (nunca duas em paralelo). Nunca lanca: falha mantem o ultimo valor e marca erro.
 */
export function refreshVitality(options?: { force?: boolean }): Promise<DynamicVitality | null> {
  if (inFlight) return inFlight;
  if (!options?.force && current && Date.now() - lastRunAt < VITALITY_MIN_AUTO_INTERVAL_MS) return Promise.resolve(current);
  const startedIn = generation;
  inFlight = (async () => {
    try {
      const result = await computeDynamicVitality();
      if (startedIn !== generation) return null; // houve logout/troca de usuario no meio: descarta
      current = result;
      failed = false;
      lastRunAt = Date.now();
      return result;
    } catch {
      failed = true;
      return current;
    } finally {
      inFlight = null;
      publish();
    }
  })();
  publish();
  return inFlight;
}
