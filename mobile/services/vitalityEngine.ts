// Motor da Vitalidade dinamica: junta as funcoes puras (vitalityDynamic.ts) com o ESTADO guardado no aparelho (ancora do ciclo, base congelada do ciclo, referencias,
// totais e ultimo valor mostrado). Logica PURA (sem React Native, sem HealthKit, sem rede, sem armazenamento: quem le e grava e services/vitalityService.ts),
// testada direto no Node (mobile/tests/vitalityEngine.test.mjs, `npm test`). E uma ESTIMATIVA de bem-estar, nao medida medica.
//
// CICLO DE VITALIDADE: comeca quando a pessoa ACORDA (fim da noite principal; cochilo = sessao iniciada entre 9h e 20h nao conta) e vai ate dormir de novo. NAO reinicia a
// meia-noite: o calendario (hoje, ontem) nao manda; a ANCORA (instante de acordar) manda. Tudo o que e "do ciclo" (base congelada, referencias, totais, ultimo valor) tem
// como chave a propria ancora (ISO). Passos, calorias, treinos, FC e descanso contam DESDE a ancora (a janela pode atravessar a meia-noite) e o tempo acordado desgasta
// de forma continua (TIME_WEAR em vitalityDynamic.ts).
import {
  awakeMinutesSince,
  displayedVitality,
  dynamicScoreToState,
  freezeMorningBase,
  monotonicDay,
  morningBase,
  personalReferences,
  vitalityNow,
} from '@/services/vitalityDynamic';
import type { DayInput, DisplayResult, FrozenBase, PersonalReferences, VitalityResult } from '@/services/vitalityDynamic';

/** Sem sono novo, a ancora GUARDADA (de uma atualizacao anterior) ainda vale por ate isto; depois, sem ancora (estado estimado, sem desgaste por tempo). */
export const ANCHOR_MAX_AGE_HOURS = 24;
/** Sem ancora, o valor nao pode subir acima do ultimo mostrado se ele e deste intervalo (falta de dado nunca eleva a Vitalidade). */
export const NO_DATA_CAP_MAX_AGE_HOURS = 24;

export type HistoryDay = Pick<DayInput, 'steps' | 'activeKcal' | 'workouts'>;

export interface StoredVitalityState {
  v: 1;
  /** Dono do estado (id do usuario no Tryv). Estado de OUTRO usuario e ignorado (storedStateForUser); ausente = estado antigo, aceito e carimbado. */
  userId?: string | null;
  /** Ultima ANCORA de acordar vista (ISO): sobrevive a virada do dia e a reinicios do app. Vale ate ANCHOR_MAX_AGE_HOURS h quando nao ha sono novo. */
  anchor?: { wakeAt: string } | null;
  /** Base congelada do CICLO (dayKey = chave do ciclo, ver cycleKeyFor). */
  frozenBase: FrozenBase | null;
  /** Referencias pessoais do ciclo (e a FC de repouso usada com elas). */
  refs: { dayKey: string; value: PersonalReferences; restHr: number | null } | null;
  /** Totais do ciclo ja vistos (a leitura seguinte so pode crescer). */
  day: { dayKey: string; value: DayInput } | null;
  /** Ultimo valor MOSTRADO e o ciclo dele. */
  lastShown: { dayKey: string; score: number } | null;
  updatedAt: number | null;
}

export const EMPTY_STORED_STATE: StoredVitalityState = { v: 1, userId: null, anchor: null, frozenBase: null, refs: null, day: null, lastShown: null, updatedAt: null };

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
  /** Instante (ISO) em que a pessoa acordou nesta noite: e a ANCORA do ciclo. */
  wakeAt: string;
  /** Minutos dormidos da noite (para exibir; opcional). */
  asleepMin?: number | null;
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
  /** Dia do calendario de `now` (YYYY-MM-DD): so serve de chave quando NAO ha ancora (estado estimado). */
  todayKey: string;
  /** Noite principal mais recente (a que ancora o ciclo); null = sem noite registrada recentemente ou sem HealthKit. */
  sleep: EngineSleep | null;
  /** Resposta do backend (null = falhou ou sem rede). */
  readiness: EngineReadiness | null;
  /** Totais lidos AGORA desde a ancora (null = leitura falhou ou sem HealthKit). */
  day: DayInput | null;
  /** Ultimos 14 dias (sem hoje) para a referencia pessoal; null = nao foi lido (usa a guardada do ciclo ou o fallback). */
  history: readonly HistoryDay[] | null;
  restHr: number | null;
  maxHr?: number | null;
  stored: StoredVitalityState | null | undefined;
  /** Usuario atual (id no Tryv); estado guardado de outro usuario e ignorado. */
  userId?: string | null;
}

export type AnchorSource = 'sleep' | 'persisted' | 'none';
export type EstimatedReason = 'sem_sono' | 'sem_movimento';

export interface VitalityDebug {
  todayKey: string;
  updatedAt: number;
  /** Ciclo: ancora (acordar), de onde veio, chave, horas acordado contadas (ja sem o cochilo) e se o valor e estimado. */
  cycle: {
    key: string;
    anchorAt: string | null;
    anchorSource: AnchorSource;
    awakeMinutes: number | null;
    estimated: boolean;
    estimatedReasons: EstimatedReason[];
    /** Valor travado para nao subir por falta de dado (null = nenhuma trava aplicada). */
    cappedBy: number | null;
  };
  /** Base: candidata deste momento, a efetivamente usada, componentes e flags. */
  base: {
    candidate: number | null;
    used: number | null;
    sleepQuality: number | null;
    sleepQualityConfidence: number;
    sleepParts: Record<string, number | undefined>;
    sleepWakeAt: string | null;
    partialSleep: boolean;
    loadPrior: number | null;
    loadWithToday: number | null;
    hr: number | null;
    /** Base final (calculada com a noite que ancora o ciclo) e congelada neste ciclo. */
    final: boolean;
    frozen: boolean;
  };
  /** Desgaste e recuperacao (null enquanto nao ha base). */
  result: VitalityResult | null;
  /** Valor bruto (sem suavizar nem travas) e valor mostrado. */
  raw: number | null;
  shown: number | null;
  refs: PersonalReferences;
  refsFromStorage: boolean;
  restHr: number | null;
  day: DayInput | null;
}

export interface EngineOutput {
  display: DisplayResult;
  /** Valor estimado: sem sono (sem ancora) e/ou sem leitura de movimento. A tela avisa. */
  estimated: boolean;
  next: StoredVitalityState;
  debug: VitalityDebug;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const HOUR_MS = 3600000;

function parseIso(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Ancora do ciclo: a noite lida AGORA (se o acordar ja passou), ou a guardada (ate ANCHOR_MAX_AGE_HOURS h); havendo as duas, a mais recente (uma leitura parcial que devolve
 * uma noite mais antiga nunca "volta" o ciclo). Sem nenhuma = none (sem ancora: nao se inventa desgaste por tempo).
 */
export function resolveCycleAnchor(
  sleepWakeAt: string | null | undefined,
  storedAnchor: { wakeAt: string } | null | undefined,
  now: Date
): { anchorMs: number | null; source: AnchorSource } {
  const nowMs = now.getTime();
  const freshMs = parseIso(sleepWakeAt);
  const fresh = freshMs != null && freshMs <= nowMs ? freshMs : null;
  const persistedMs = parseIso(storedAnchor?.wakeAt);
  const persisted = persistedMs != null && persistedMs <= nowMs && nowMs - persistedMs <= ANCHOR_MAX_AGE_HOURS * HOUR_MS ? persistedMs : null;
  if (fresh != null && (persisted == null || fresh >= persisted)) return { anchorMs: fresh, source: 'sleep' };
  if (persisted != null) return { anchorMs: persisted, source: 'persisted' };
  return { anchorMs: null, source: 'none' };
}

/** Chave do ciclo: a ancora (ISO); sem ancora, uma chave do dia do calendario (estado estimado, nunca congelado). */
export function cycleKeyFor(anchorMs: number | null, todayKey: string): string {
  return anchorMs != null ? new Date(anchorMs).toISOString() : `sem-ancora:${todayKey}`;
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
  const nowMs = input.now.getTime();

  // 1) Ancora e chave do ciclo.
  const { anchorMs, source: anchorSource } = resolveCycleAnchor(input.sleep?.wakeAt, stored.anchor, input.now);
  const cycleKey = cycleKeyFor(anchorMs, input.todayKey);

  // 2) Base: so a noite que ANCORA o ciclo conta como sono deste ciclo; e FINAL (congelavel) quando vem dela. Sem ancora nao congela nada (o sono pode chegar depois).
  const sleepForBase = input.sleep && anchorMs != null && parseIso(input.sleep.wakeAt) === anchorMs ? input.sleep : null;
  const candidate = candidateBase(sleepForBase, input.readiness);
  const final = sleepForBase != null && isNum(sleepForBase.quality);
  const frozen = freezeMorningBase(stored.frozenBase, cycleKey, { base: candidate.base, final });
  const wasFrozen = !!stored.frozenBase && stored.frozenBase.dayKey === cycleKey;

  // 3) Referencias do ciclo: as ja guardadas; senao do historico lido agora (so fixa se vieram do historico); senao fallback.
  let refs: PersonalReferences;
  let restHr = input.restHr;
  let refsFromStorage = false;
  let refsToStore = stored.refs;
  if (stored.refs && stored.refs.dayKey === cycleKey) {
    refs = stored.refs.value;
    restHr = isNum(stored.refs.restHr) ? stored.refs.restHr : restHr;
    refsFromStorage = true;
  } else if (input.history) {
    refs = personalReferences(input.history, restHr, input.maxHr);
    // So fixa as referencias se vieram do HISTORICO (passos ou calorias); se vieram do fallback, tenta de novo na proxima atualizacao.
    if (refs.fromHistory.steps || refs.fromHistory.kcal) refsToStore = { dayKey: cycleKey, value: refs, restHr };
  } else {
    refs = personalReferences([], restHr, input.maxHr);
  }

  // 4) Totais do ciclo: so crescem (leitura que falha ou atrasa nao "recupera" a Vitalidade). O tempo acordado e recalculado a cada vez (desde a ancora, sem o cochilo).
  const previousDay = stored.day && stored.day.dayKey === cycleKey ? stored.day.value : null;
  const merged = input.day ? monotonicDay(previousDay, input.day) : previousDay;
  const awakeMinutes = anchorMs != null ? awakeMinutesSince(anchorMs, nowMs, merged?.napMinutes ?? 0) : null;
  const day: DayInput | null = merged ? { ...merged, awakeMinutes } : anchorMs != null ? { steps: null, activeKcal: null, workouts: [], awakeMinutes } : null;

  // 5) O que mostrar (suavizado so dentro do mesmo ciclo).
  const previousShown = stored.lastShown && stored.lastShown.dayKey === cycleKey ? stored.lastShown.score : null;
  const displayRaw = displayedVitality({
    base: frozen.base,
    provisional: false,
    day,
    refs,
    restHr,
    maxHr: input.maxHr,
    previousShown,
    previousShownIsToday: previousShown != null,
    yesterdayFinal: null,
  });

  // 6) Falta de dado NUNCA eleva a Vitalidade: sem leitura de movimento, nao passa do ultimo valor do ciclo; sem ancora (sem sono), nao passa do ultimo valor recente.
  const movementMissing = !day || (day.steps == null && day.activeKcal == null);
  const noSleep = anchorSource === 'none';
  const reasons: EstimatedReason[] = [];
  if (noSleep) reasons.push('sem_sono');
  if (movementMissing) reasons.push('sem_movimento');
  let score = displayRaw.score;
  let cappedBy: number | null = null;
  if (score != null) {
    const caps: number[] = [];
    if (movementMissing && previousShown != null) caps.push(previousShown);
    const recent = stored.lastShown && stored.updatedAt != null && nowMs - stored.updatedAt <= NO_DATA_CAP_MAX_AGE_HOURS * HOUR_MS ? stored.lastShown.score : null;
    if (noSleep && recent != null) caps.push(recent);
    for (const cap of caps) {
      if (score > cap) {
        cappedBy = cap;
        score = cap;
      }
    }
  }
  const display: DisplayResult = { ...displayRaw, score, state: dynamicScoreToState(score) };

  const nextAnchor = anchorMs != null ? { wakeAt: new Date(anchorMs).toISOString() } : stored.anchor ?? null;
  const next: StoredVitalityState = {
    v: 1,
    userId: input.userId ?? stored.userId ?? null,
    anchor: nextAnchor,
    frozenBase: frozen.persist ?? stored.frozenBase,
    refs: refsToStore,
    day: day ? { dayKey: cycleKey, value: day } : stored.day && stored.day.dayKey === cycleKey ? stored.day : null,
    lastShown: score != null ? { dayKey: cycleKey, score } : stored.lastShown,
    updatedAt: nowMs,
  };

  const raw = frozen.base != null ? vitalityNow(frozen.base, day ?? { steps: null, activeKcal: null, workouts: [] }, refs, restHr, input.maxHr).score : null;

  const debug: VitalityDebug = {
    todayKey: input.todayKey,
    updatedAt: nowMs,
    cycle: {
      key: cycleKey,
      anchorAt: anchorMs != null ? new Date(anchorMs).toISOString() : null,
      anchorSource,
      awakeMinutes,
      estimated: reasons.length > 0,
      estimatedReasons: reasons,
      cappedBy,
    },
    base: {
      candidate: candidate.base,
      used: frozen.base,
      sleepQuality: sleepForBase && isNum(sleepForBase.quality) ? sleepForBase.quality : null,
      sleepQualityConfidence: sleepForBase ? sleepForBase.confidence : 0,
      sleepParts: sleepForBase ? sleepForBase.parts : {},
      sleepWakeAt: input.sleep ? input.sleep.wakeAt : null,
      partialSleep: candidate.partialSleep,
      loadPrior: input.readiness && isNum(input.readiness.load_score_prior) ? input.readiness.load_score_prior : null,
      loadWithToday: input.readiness && isNum(input.readiness.load_score) ? input.readiness.load_score : null,
      hr: input.readiness && isNum(input.readiness.hr_score) ? input.readiness.hr_score : null,
      final,
      frozen: wasFrozen || frozen.persist != null,
    },
    result: display.result,
    raw,
    shown: score,
    refs,
    refsFromStorage,
    restHr,
    day,
  };

  return { display, estimated: reasons.length > 0, next, debug };
}
