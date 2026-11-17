// Motor da Vitalidade dinamica: junta as funcoes puras (vitalityDynamic.ts) com o ESTADO guardado no aparelho (base congelada do dia, referencias do dia,
// totais do dia, ultimo valor mostrado). Logica PURA (sem React Native, sem HealthKit, sem rede, sem armazenamento: quem le e grava e services/vitalityService.ts),
// testada direto no Node (mobile/tests/vitalityEngine.test.mjs, `npm test`). E uma ESTIMATIVA de bem-estar, nao medida medica.
import {
  displayedVitality,
  freezeMorningBase,
  monotonicDay,
  morningBase,
  personalReferences,
  vitalityNow,
} from '@/services/vitalityDynamic';
import type { DayInput, DisplayResult, FrozenBase, PersonalReferences, VitalityResult } from '@/services/vitalityDynamic';

/** Antes dessa hora (local), sem nenhuma noite registrada, a base ainda e provisoria (a pessoa pode nao ter acordado); depois, usa sono neutro. */
export const BASE_FINAL_AFTER_HOUR = 10;

export type HistoryDay = Pick<DayInput, 'steps' | 'activeKcal' | 'workouts'>;

export interface StoredVitalityState {
  v: 1;
  /** Dono do estado (id do usuario no Tryv). Estado de OUTRO usuario e ignorado (storedStateForUser); ausente = estado antigo, aceito e carimbado. */
  userId?: string | null;
  /** Base da manha congelada (um por dia). */
  frozenBase: FrozenBase | null;
  /** Referencias pessoais fixadas uma vez por dia (e a FC de repouso usada com elas). */
  refs: { dayKey: string; value: PersonalReferences; restHr: number | null } | null;
  /** Totais de hoje ja vistos (a leitura seguinte so pode crescer). */
  day: { dayKey: string; value: DayInput } | null;
  /** Ultimo valor MOSTRADO (nao provisorio) e o dia dele. */
  lastShown: { dayKey: string; score: number } | null;
  updatedAt: number | null;
}

export const EMPTY_STORED_STATE: StoredVitalityState = { v: 1, userId: null, frozenBase: null, refs: null, day: null, lastShown: null, updatedAt: null };

/**
 * Estado guardado que PODE ser usado por `userId`: invalido ou de outra versao = vazio; de OUTRO usuario (os dois ids conhecidos e diferentes) = vazio (a
 * base congelada, as referencias e o ultimo valor de uma pessoa nunca valem para outra no mesmo aparelho); sem dono gravado (estado antigo) ou sem usuario
 * conhecido agora = aceito.
 */
export function storedStateForUser(stored: StoredVitalityState | null | undefined, userId: string | null | undefined): StoredVitalityState {
  if (!stored || (stored as { v?: unknown }).v !== 1) return EMPTY_STORED_STATE;
  if (stored.userId && userId && stored.userId !== userId) return EMPTY_STORED_STATE;
  return stored;
}

export interface EngineSleep {
  quality: number | null;
  confidence: number;
  parts: Record<string, number | undefined>;
  /** true = a noite termina hoje; false = e a de ontem (provisoria). */
  isToday: boolean;
}

export interface EngineReadiness {
  sleep_score?: number | null;
  load_score?: number | null;
  /** Carga dos 7 dias ANTERIORES a hoje (sem hoje); backend antigo nao manda: cai em load_score. */
  load_score_prior?: number | null;
  hr_score?: number | null;
}

export interface EngineInput {
  now: Date;
  todayKey: string;
  yesterdayKey: string;
  /** Qualidade do sono lida do HealthKit (null = sem noite hoje nem ontem, ou sem HealthKit). */
  sleep: EngineSleep | null;
  /** Resposta do backend (null = falhou ou sem rede). */
  readiness: EngineReadiness | null;
  /** Totais de hoje lidos agora (null = leitura falhou ou sem HealthKit). */
  day: DayInput | null;
  /** Ultimos 14 dias (sem hoje) para a referencia pessoal; null = nao foi lido (usa a guardada de hoje ou o fallback). */
  history: readonly HistoryDay[] | null;
  restHr: number | null;
  maxHr?: number | null;
  stored: StoredVitalityState | null | undefined;
  /** Usuario atual (id no Tryv); estado guardado de outro usuario e ignorado. */
  userId?: string | null;
}

export interface VitalityDebug {
  todayKey: string;
  updatedAt: number;
  /** Base: candidata deste momento, a efetivamente usada, componentes e flags. */
  base: {
    candidate: number | null;
    used: number | null;
    sleepQuality: number | null;
    sleepQualityConfidence: number;
    sleepParts: Record<string, number | undefined>;
    sleepIsToday: boolean | null;
    partialSleep: boolean;
    loadPrior: number | null;
    loadWithToday: number | null;
    hr: number | null;
    final: boolean;
    frozen: boolean;
    provisional: boolean;
  };
  /** Desgaste e recuperacao (null enquanto a base e provisoria ou nao existe). */
  result: VitalityResult | null;
  /** Valor bruto (sem suavizar) e valor mostrado. */
  raw: number | null;
  shown: number | null;
  refs: PersonalReferences;
  refsFromStorage: boolean;
  restHr: number | null;
  day: DayInput | null;
  yesterdayFinal: number | null;
}

export interface EngineOutput {
  display: DisplayResult;
  next: StoredVitalityState;
  debug: VitalityDebug;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A base e FINAL (pode ser congelada) quando ja ha a noite de HOJE; sem nenhuma noite registrada, so depois das BASE_FINAL_AFTER_HOUR h (antes disso a pessoa
 * pode simplesmente nao ter acordado); com a noite de ontem apenas, e provisoria.
 */
export function isBaseFinal(sleep: Pick<EngineSleep, 'isToday'> | null | undefined, now: Date): boolean {
  if (sleep) return sleep.isToday === true;
  return now.getHours() >= BASE_FINAL_AFTER_HOUR;
}

/**
 * Base candidata deste momento: sono = qualidade calculada no aparelho; carga = a dos 7 dias ANTERIORES a hoje (load_score_prior; sem ela, load_score);
 * FC = hr_score do backend. Mesma regra de "sem dados" de antes: sem a qualidade do sono E sem FC nao ha base (so a carga nao basta).
 */
export function candidateBase(sleep: EngineSleep | null, readiness: EngineReadiness | null): { base: number | null; partialSleep: boolean } {
  const quality = sleep && isNum(sleep.quality) ? sleep.quality : null;
  const hr = readiness && isNum(readiness.hr_score) ? readiness.hr_score : null;
  if (quality == null && hr == null) return { base: null, partialSleep: true };
  const load = readiness ? (isNum(readiness.load_score_prior) ? readiness.load_score_prior : isNum(readiness.load_score) ? readiness.load_score : null) : null;
  return morningBase({ sleep: quality, load, hr });
}

/** Roda uma atualizacao: calcula o que mostrar e o novo estado a guardar. Nunca lanca. */
export function runVitalityEngine(input: EngineInput): EngineOutput {
  const stored = storedStateForUser(input.stored, input.userId);
  const { todayKey, yesterdayKey } = input;

  // Valor de ontem a noite (so o do dia anterior): mostrado, provisoriamente, ate haver o sono de hoje.
  const yesterdayFinal = stored.lastShown && stored.lastShown.dayKey === yesterdayKey ? stored.lastShown.score : null;

  // Base: congelada (a de hoje, se ja existe) ou a candidata deste momento.
  const candidate = candidateBase(input.sleep, input.readiness);
  const final = isBaseFinal(input.sleep, input.now);
  const frozen = freezeMorningBase(stored.frozenBase, todayKey, { base: candidate.base, final });
  const wasFrozen = !!stored.frozenBase && stored.frozenBase.dayKey === todayKey;

  // Referencias: as de hoje ja guardadas; senao calcula do historico lido agora (so guarda se de fato leu o historico); senao fallback.
  let refs: PersonalReferences;
  let restHr = input.restHr;
  let refsFromStorage = false;
  let refsToStore = stored.refs;
  if (stored.refs && stored.refs.dayKey === todayKey) {
    refs = stored.refs.value;
    restHr = isNum(stored.refs.restHr) ? stored.refs.restHr : restHr;
    refsFromStorage = true;
  } else if (input.history) {
    refs = personalReferences(input.history, restHr, input.maxHr);
    refsToStore = { dayKey: todayKey, value: refs, restHr };
  } else {
    refs = personalReferences([], restHr, input.maxHr);
  }

  // Totais de hoje: so crescem (leitura que falha ou atrasa nao "recupera" a Vitalidade).
  const previousDay = stored.day && stored.day.dayKey === todayKey ? stored.day.value : null;
  const day = input.day ? monotonicDay(previousDay, input.day) : previousDay;

  const previousShown = stored.lastShown && stored.lastShown.dayKey === todayKey ? stored.lastShown.score : null;
  const display = displayedVitality({
    base: frozen.base,
    provisional: frozen.provisional,
    day,
    refs,
    restHr,
    maxHr: input.maxHr,
    previousShown,
    previousShownIsToday: previousShown != null,
    yesterdayFinal,
  });

  const nextFrozen = frozen.persist ?? stored.frozenBase;
  const next: StoredVitalityState = {
    v: 1,
    userId: input.userId ?? stored.userId ?? null,
    frozenBase: nextFrozen,
    refs: refsToStore,
    day: day ? { dayKey: todayKey, value: day } : stored.day && stored.day.dayKey === todayKey ? stored.day : null,
    lastShown: display.score != null && !display.provisional ? { dayKey: todayKey, score: display.score } : stored.lastShown,
    updatedAt: input.now.getTime(),
  };

  const raw = frozen.base != null && !frozen.provisional
    ? vitalityNow(frozen.base, day ?? { steps: null, activeKcal: null, workouts: [] }, refs, restHr, input.maxHr).score
    : null;

  const debug: VitalityDebug = {
    todayKey,
    updatedAt: input.now.getTime(),
    base: {
      candidate: candidate.base,
      used: frozen.base,
      sleepQuality: input.sleep && isNum(input.sleep.quality) ? input.sleep.quality : null,
      sleepQualityConfidence: input.sleep ? input.sleep.confidence : 0,
      sleepParts: input.sleep ? input.sleep.parts : {},
      sleepIsToday: input.sleep ? input.sleep.isToday : null,
      partialSleep: candidate.partialSleep,
      loadPrior: input.readiness && isNum(input.readiness.load_score_prior) ? input.readiness.load_score_prior : null,
      loadWithToday: input.readiness && isNum(input.readiness.load_score) ? input.readiness.load_score : null,
      hr: input.readiness && isNum(input.readiness.hr_score) ? input.readiness.hr_score : null,
      final,
      frozen: wasFrozen || frozen.persist != null,
      provisional: frozen.provisional,
    },
    result: display.result,
    raw,
    shown: display.score,
    refs,
    refsFromStorage,
    restHr,
    day,
    yesterdayFinal,
  };

  return { display, next, debug };
}
