// Das amostras de sono do HealthKit para as "noites" que alimentam a qualidade do sono (services/sleepQuality.ts). Logica PURA (so usa funcoes puras de
// healthkitState.ts e sleepQuality.ts; testada no Node em mobile/tests/sleepNights.test.mjs). A leitura do HealthKit (IO) fica em healthkit.ts
// (fetchSleepQualityReading). Nada daqui sai do aparelho: so o numero final (quando a rodada de envio existir).
import { addDays, asleepMinutes, groupSleepSessions, preferStageSource, startOfDay, toDateKey } from '@/services/healthkitState';
import type { SleepSample } from '@/services/healthkitState';
import { computeSleepQuality } from '@/services/sleepQuality';
import type { SleepNightInput, SleepQualityComponent } from '@/services/sleepQuality';

// Valores de HKCategoryValueSleepAnalysis (os mesmos de healthkitState.ts): 0 na cama, 1 dormindo sem estagio, 2 acordado, 3 leve (core), 4 profundo, 5 REM.
const IN_BED = 0;
const AWAKE = 2;
const DEEP = 4;
const REM = 5;
const STAGE_VALUES = new Set([3, 4, 5]);

/** Sessao que COMECA entre 9h e 20h (horario local) e soneca, nao a noite: fica de fora das noites (so a noite entra na qualidade). */
export const NAP_START_HOUR_MIN = 9;
export const NAP_START_HOUR_MAX = 20;
/** Quantos dias para tras ler as amostras: 7 noites + folga para a noite que comeca antes da meia-noite do primeiro dia. */
export const SLEEP_QUALITY_LOOKBACK_DAYS = 9;

export interface SleepNightForQuality extends SleepNightInput {
  /** Dia local (YYYY-MM-DD) em que a pessoa ACORDOU. */
  wakeDate: string;
  /** Instante (ISO) em que acordou: o fim do ultimo trecho de sono da noite. */
  wakeAt: string;
}

export interface SleepQualityReading {
  /** 0-100 ou null (sem duracao). */
  quality: number | null;
  confidence: number;
  parts: Partial<Record<SleepQualityComponent, number>>;
  /** Dia (local) em que acordou. */
  wakeDate: string;
  /** true = a noite termina HOJE; false = e a de ontem (hoje a pessoa ainda nao acordou ou nao sincronizou): valor PROVISORIO. */
  isToday: boolean;
  /** Instante (ISO) em que acordou nessa noite. */
  wakeAt: string;
  /** Minutos dormidos da noite (uniao dos intervalos). */
  asleepMin: number;
}

/** A noite que ancora o ciclo da Vitalidade so vale se a pessoa acordou ha no maximo isto (acordado ha mais tempo sem registrar outra noite = sem ancora). */
export const CYCLE_LOOKBACK_HOURS = 36;

const valid = (s: SleepSample): boolean =>
  s?.startDate instanceof Date && s?.endDate instanceof Date && !Number.isNaN(s.startDate.getTime()) && !Number.isNaN(s.endDate.getTime()) && s.endDate.getTime() > s.startDate.getTime();

/** Minutos cobertos pela UNIAO dos intervalos que passam em `pick`, opcionalmente recortados para [clipStart, clipEnd] (ms). */
function unionMinutes(samples: readonly SleepSample[], pick: (s: SleepSample) => boolean, clipStart?: number, clipEnd?: number): number {
  const intervals: [number, number][] = [];
  for (const s of samples) {
    if (!valid(s) || !pick(s)) continue;
    const a = clipStart == null ? s.startDate.getTime() : Math.max(clipStart, s.startDate.getTime());
    const b = clipEnd == null ? s.endDate.getTime() : Math.min(clipEnd, s.endDate.getTime());
    if (b > a) intervals.push([a, b]);
  }
  intervals.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = 0;
  let open = false;
  for (const [a, b] of intervals) {
    if (!open) {
      curStart = a;
      curEnd = b;
      open = true;
    } else if (a <= curEnd) {
      curEnd = Math.max(curEnd, b);
    } else {
      total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    }
  }
  if (open) total += curEnd - curStart;
  return total / 60000;
}

const isAsleep = (s: SleepSample) => s.value === 1 || STAGE_VALUES.has(s.value);

/**
 * As noites (da mais antiga para a mais nova) para a qualidade do sono. Regras:
 *  - cada SESSAO (pausa maxima de 90 min, groupSleepSessions) e atribuida ao dia em que a pessoa ACORDOU; sessoes de soneca (comecam entre 9h e 20h)
 *    ficam de fora; as demais do mesmo dia de despertar se juntam numa so noite (uma noite quebrada por mais de 90 min continua sendo uma noite);
 *  - minutos dormidos = UNIAO dos intervalos (varias fontes gravando o mesmo sono nao contam duas vezes);
 *  - eficiencia: so se ha amostras "na cama"; despertares e estagios: so se a fonte registra estagios (profundo/leve/REM), com a fonte que mais tem
 *    estagio (preferStageSource); sem estagio esses campos ficam null (ausentes), nunca zero;
 *  - ponto medio = meio entre o primeiro inicio e o ultimo fim de sono, em minutos desde a meia-noite local.
 * Devolve no maximo `count` noites (as mais recentes).
 */
export function buildSleepNightsForQuality(samples: readonly SleepSample[], count = 7): SleepNightForQuality[] {
  const byWake = new Map<string, SleepSample[]>();
  for (const session of groupSleepSessions(samples ?? [])) {
    const asleepSamples = session.filter((s) => valid(s) && isAsleep(s));
    if (asleepSamples.length === 0) continue;
    const start = new Date(Math.min(...asleepSamples.map((s) => s.startDate.getTime())));
    const startHour = start.getHours() + start.getMinutes() / 60;
    if (startHour >= NAP_START_HOUR_MIN && startHour < NAP_START_HOUR_MAX) continue; // soneca
    const wake = new Date(Math.max(...asleepSamples.map((s) => s.endDate.getTime())));
    const key = toDateKey(wake);
    byWake.set(key, [...(byWake.get(key) ?? []), ...session.filter(valid)]);
  }

  const nights: SleepNightForQuality[] = [];
  for (const [wakeDate, all] of byWake) {
    const asleepMin = asleepMinutes(all);
    if (!(asleepMin > 0)) continue;
    const asleepSamples = all.filter(isAsleep);
    const firstStart = Math.min(...asleepSamples.map((s) => s.startDate.getTime()));
    const lastEnd = Math.max(...asleepSamples.map((s) => s.endDate.getTime()));
    const mid = new Date((firstStart + lastEnd) / 2);

    const inBedMin = unionMinutes(all, (s) => s.value === IN_BED);
    const staged = preferStageSource(all);
    const hasStages = staged.some((s) => STAGE_VALUES.has(s.value));

    nights.push({
      wakeDate,
      wakeAt: new Date(lastEnd).toISOString(),
      asleepMin,
      inBedMin: inBedMin > 0 ? inBedMin : null,
      awakeAfterOnsetMin: hasStages ? unionMinutes(staged, (s) => s.value === AWAKE, firstStart, lastEnd) : null,
      deepMin: hasStages ? unionMinutes(staged, (s) => s.value === DEEP) : null,
      remMin: hasStages ? unionMinutes(staged, (s) => s.value === REM) : null,
      midpointMin: mid.getHours() * 60 + mid.getMinutes(),
    });
  }
  nights.sort((a, b) => (a.wakeDate < b.wakeDate ? -1 : a.wakeDate > b.wakeDate ? 1 : 0));
  return nights.slice(-Math.max(1, count));
}

/**
 * Qualidade do sono para a prontidao de HOJE: a noite que terminou hoje; se ainda nao ha (antes de acordar ou sem sincronizar), a de ONTEM marcada
 * como provisoria (isToday = false); nada mais antigo que ontem. Sem noite = null. A divida e a regularidade usam as noites ate a escolhida.
 */
export function sleepQualityForToday(samples: readonly SleepSample[], now: Date = new Date(), needHours?: number): SleepQualityReading | null {
  const todayKey = toDateKey(now);
  const yesterdayKey = toDateKey(addDays(startOfDay(now), -1));
  const nights = buildSleepNightsForQuality(samples).filter((n) => n.wakeDate <= todayKey);
  if (nights.length === 0) return null;
  const chosen = nights[nights.length - 1];
  if (chosen.wakeDate !== todayKey && chosen.wakeDate !== yesterdayKey) return null;
  const result = needHours == null ? computeSleepQuality(nights) : computeSleepQuality(nights, needHours);
  return {
    quality: result.quality,
    confidence: result.confidence,
    parts: result.parts,
    wakeDate: chosen.wakeDate,
    isToday: chosen.wakeDate === todayKey,
    wakeAt: chosen.wakeAt,
    asleepMin: chosen.asleepMin as number,
  };
}

/**
 * Leitura de sono para o CICLO da Vitalidade: a noite PRINCIPAL mais recente (cochilo = sessao iniciada entre 9h e 20h fica de fora) cujo acordar ja passou, de QUALQUER
 * dia do calendario (a noite 02:20-11:54 de segunda continua sendo a ancora a 00:05 de terca). So vale se acordou ha ate CYCLE_LOOKBACK_HOURS h; senao null (sem ancora).
 * `isToday` so informa se o acordar foi no dia do calendario de `now`. A divida e a regularidade usam as noites ate a escolhida.
 */
export function sleepCycleReading(samples: readonly SleepSample[], now: Date = new Date(), needHours?: number): SleepQualityReading | null {
  const todayKey = toDateKey(now);
  const nights = buildSleepNightsForQuality(samples).filter((n) => Date.parse(n.wakeAt) <= now.getTime());
  if (nights.length === 0) return null;
  const chosen = nights[nights.length - 1];
  if (now.getTime() - Date.parse(chosen.wakeAt) > CYCLE_LOOKBACK_HOURS * 3600000) return null;
  const result = needHours == null ? computeSleepQuality(nights) : computeSleepQuality(nights, needHours);
  return {
    quality: result.quality,
    confidence: result.confidence,
    parts: result.parts,
    wakeDate: chosen.wakeDate,
    isToday: chosen.wakeDate === todayKey,
    wakeAt: chosen.wakeAt,
    asleepMin: chosen.asleepMin as number,
  };
}

/**
 * Minutos de SONECA desde `fromMs` (a ancora do ciclo): sessoes que comecam entre 9h e 20h, iniciadas depois de `fromMs` e ja terminadas em `now`, pela uniao dos intervalos de
 * sono. Sem soneca = 0.
 */
export function napMinutesSince(samples: readonly SleepSample[], fromMs: number, now: Date = new Date()): number {
  let total = 0;
  for (const session of groupSleepSessions(samples ?? [])) {
    const asleepSamples = session.filter((s) => valid(s) && isAsleep(s));
    if (asleepSamples.length === 0) continue;
    const start = new Date(Math.min(...asleepSamples.map((s) => s.startDate.getTime())));
    const end = Math.max(...asleepSamples.map((s) => s.endDate.getTime()));
    const startHour = start.getHours() + start.getMinutes() / 60;
    if (startHour >= NAP_START_HOUR_MIN && startHour < NAP_START_HOUR_MAX && start.getTime() >= fromMs && end <= now.getTime()) total += asleepMinutes(session);
  }
  return Math.round(total);
}

/**
 * Minutos de SONECA de hoje: sessoes que comecam entre 9h e 20h (mesma regra que tira a soneca das noites) e terminam hoje, pela uniao dos intervalos de
 * sono. Alimenta a recuperacao da Vitalidade (a soneca devolve um pouco). Sem soneca = 0.
 */
export function napMinutesToday(samples: readonly SleepSample[], now: Date = new Date()): number {
  const dayStart = startOfDay(now).getTime();
  let total = 0;
  for (const session of groupSleepSessions(samples ?? [])) {
    const asleepSamples = session.filter((s) => valid(s) && isAsleep(s));
    if (asleepSamples.length === 0) continue;
    const start = new Date(Math.min(...asleepSamples.map((s) => s.startDate.getTime())));
    const end = Math.max(...asleepSamples.map((s) => s.endDate.getTime()));
    const startHour = start.getHours() + start.getMinutes() / 60;
    if (startHour >= NAP_START_HOUR_MIN && startHour < NAP_START_HOUR_MAX && end >= dayStart && end <= now.getTime()) total += asleepMinutes(session);
  }
  return Math.round(total);
}
