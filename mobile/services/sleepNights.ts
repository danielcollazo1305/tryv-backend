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
  /** Fim (ISO) da amostra de sono mais recente lida (qualquer noite, soneca ou trecho; ver latestSleepSampleEnd); null se nao ha. Alimenta o rotulo de frescor. */
  latestSampleEndAt: string | null;
  /** Fonte (nome) dessa amostra mais recente, para o rotulo citar o Garmin Connect so quando e ele. */
  latestSampleSource: string | null;
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

/** Sono dormido abaixo disto, SEM nenhum estagio (profundo/leve/REM), e um trecho PARCIAL (parte de uma noite que ainda nao sincronizou), nunca "a noite". Com estagios, noite curta continua valida. */
export const PARTIAL_SLEEP_MAX_MINUTES = 180;

/** Janela de leitura da tela de Sono (horas para tras). Larga o bastante para o corte por INICIO de amostra do HealthKit nao deixar so a cauda de uma noite (antes: 32 h). */
export const SLEEP_SCREEN_LOOKBACK_HOURS = 72;

export type SleepSessionKind = 'night' | 'nap' | 'partial';

/** Uma noite (ou trecho) junta por dia de ACORDAR: todas as sessoes nao-soneca que terminam no mesmo dia. */
export interface SleepNightGroup {
  /** Dia local (YYYY-MM-DD) em que acordou. */
  wakeDate: string;
  /** Instante (ISO) do inicio e do fim (acordar) do sono do grupo. */
  startAt: string;
  wakeAt: string;
  /** Minutos dormidos (uniao dos intervalos); 0 quando so ha "na cama". */
  asleepMin: number;
  /** Ha algum estagio real (profundo/leve/REM) na fonte preferida. */
  hasStages: boolean;
  /** Parcial = dormido < PARTIAL_SLEEP_MAX_MINUTES E sem estagios. */
  partial: boolean;
  /** Todas as amostras das sessoes do grupo (inclusive "na cama"). */
  samples: SleepSample[];
}

/** Uma sessao crua (pausa maxima de 90 min) com a classificacao, para o diagnostico. */
export interface SleepSessionInfo {
  startAt: string;
  endAt: string;
  asleepMin: number;
  hasStages: boolean;
  sources: string[];
  values: number[];
  kind: SleepSessionKind;
  wakeDate: string;
}

interface SleepAnalysis {
  groups: SleepNightGroup[];
  sessions: SleepSessionInfo[];
}

/**
 * Classificacao UNICA que tela de Sono, Home e Vitalidade compartilham. Cada sessao (groupSleepSessions) e: SONECA se comeca entre 9h e 20h; senao entra numa noite,
 * agrupada pelo dia em que a pessoa ACORDOU (uma noite quebrada por mais de 90 min continua sendo uma noite). O grupo e PARCIAL se dormiu < 180 min e nao tem
 * nenhum estagio; senao e uma noite completa. Sessao so com "na cama" (0 min dormidos) tambem vira trecho parcial.
 */
function analyzeSleep(samples: readonly SleepSample[] | null | undefined): SleepAnalysis {
  type Info = { list: SleepSample[]; start: number; end: number; isNap: boolean; wakeKey: string };
  const infos: Info[] = [];
  for (const session of groupSleepSessions(samples ?? [])) {
    const list = session.filter(valid);
    if (list.length === 0) continue;
    const asleepSamples = list.filter(isAsleep);
    const basis = asleepSamples.length > 0 ? asleepSamples : list;
    const start = Math.min(...basis.map((x) => x.startDate.getTime()));
    const end = Math.max(...basis.map((x) => x.endDate.getTime()));
    const startDate = new Date(start);
    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    infos.push({ list, start, end, isNap: startHour >= NAP_START_HOUR_MIN && startHour < NAP_START_HOUR_MAX, wakeKey: toDateKey(new Date(end)) });
  }

  const byWake = new Map<string, Info[]>();
  for (const info of infos) if (!info.isNap) byWake.set(info.wakeKey, [...(byWake.get(info.wakeKey) ?? []), info]);

  const groups: SleepNightGroup[] = [];
  const kindByWake = new Map<string, 'night' | 'partial'>();
  for (const [wakeDate, list] of byWake) {
    const all = list.flatMap((x) => x.list);
    const asleepMin = asleepMinutes(all);
    const hasStages = preferStageSource(all).some((x) => STAGE_VALUES.has(x.value));
    const partial = asleepMin < PARTIAL_SLEEP_MAX_MINUTES && !hasStages;
    kindByWake.set(wakeDate, partial ? 'partial' : 'night');
    groups.push({
      wakeDate,
      startAt: new Date(Math.min(...list.map((x) => x.start))).toISOString(),
      wakeAt: new Date(Math.max(...list.map((x) => x.end))).toISOString(),
      asleepMin,
      hasStages,
      partial,
      samples: all,
    });
  }
  groups.sort((x, y) => Date.parse(x.wakeAt) - Date.parse(y.wakeAt));

  const sessions: SleepSessionInfo[] = infos
    .map((info) => ({
      startAt: new Date(info.start).toISOString(),
      endAt: new Date(info.end).toISOString(),
      asleepMin: asleepMinutes(info.list),
      hasStages: info.list.some((x) => STAGE_VALUES.has(x.value)),
      sources: [...new Set(info.list.map((x) => x.sourceName ?? x.sourceId ?? '?'))],
      values: [...new Set(info.list.map((x) => x.value))].sort((m, n) => m - n),
      kind: (info.isNap ? 'nap' : kindByWake.get(info.wakeKey) ?? 'partial') as SleepSessionKind,
      wakeDate: info.wakeKey,
    }))
    .sort((x, y) => Date.parse(x.startAt) - Date.parse(y.startAt));
  return { groups, sessions };
}

/** Sessoes lidas, cada uma com a classificacao (noite / soneca / parcial), para o diagnostico do modo desenvolvedor. */
export function describeSleepSessions(samples: readonly SleepSample[] | null | undefined): SleepSessionInfo[] {
  return analyzeSleep(samples).sessions;
}

function nightFromGroup(g: SleepNightGroup): SleepNightForQuality {
  const all = g.samples;
  const asleepSamples = all.filter(isAsleep);
  const firstStart = Math.min(...asleepSamples.map((x) => x.startDate.getTime()));
  const lastEnd = Math.max(...asleepSamples.map((x) => x.endDate.getTime()));
  const mid = new Date((firstStart + lastEnd) / 2);
  const inBedMin = unionMinutes(all, (x) => x.value === IN_BED);
  const staged = preferStageSource(all);
  const hasStages = g.hasStages;
  return {
    wakeDate: g.wakeDate,
    wakeAt: new Date(lastEnd).toISOString(),
    asleepMin: g.asleepMin,
    inBedMin: inBedMin > 0 ? inBedMin : null,
    awakeAfterOnsetMin: hasStages ? unionMinutes(staged, (x) => x.value === AWAKE, firstStart, lastEnd) : null,
    deepMin: hasStages ? unionMinutes(staged, (x) => x.value === DEEP) : null,
    remMin: hasStages ? unionMinutes(staged, (x) => x.value === REM) : null,
    midpointMin: mid.getHours() * 60 + mid.getMinutes(),
  };
}

/**
 * As noites COMPLETAS (da mais antiga para a mais nova) para a qualidade do sono: so noites principais (soneca fora) e nao parciais (ver analyzeSleep). Minutos dormidos
 * = UNIAO dos intervalos (varias fontes gravando o mesmo sono nao contam duas vezes); eficiencia so se ha "na cama"; despertares e estagios so se a fonte registra
 * estagios (preferStageSource), senao null (ausentes, nunca zero); ponto medio em minutos desde a meia-noite local. Devolve no maximo `count` noites (as mais recentes).
 */
export function buildSleepNightsForQuality(samples: readonly SleepSample[], count = 7): SleepNightForQuality[] {
  const nights = analyzeSleep(samples)
    .groups.filter((g) => !g.partial)
    .map(nightFromGroup);
  nights.sort((a, b) => (a.wakeDate < b.wakeDate ? -1 : a.wakeDate > b.wakeDate ? 1 : 0));
  return nights.slice(-Math.max(1, count));
}

export interface SleepFragment {
  startAt: string;
  endAt: string;
  /** Duracao do trecho (fim - inicio), em minutos: a mesma conta de "na cama" da tela. */
  spanMin: number;
  asleepMin: number;
}

/**
 * Noite a mostrar na tela de Sono: a ultima noite COMPLETA (acordar ja passou) e, se houver um trecho parcial MAIS NOVO que ela (sincronizacao incompleta), o trecho
 * para a faixa de aviso. Sem noite completa e com trecho: night = null e partial preenchido = estado "aguardando". Sem nada: os dois null.
 */
export function selectSleepNightForScreen(
  samples: readonly SleepSample[] | null | undefined,
  now: Date = new Date()
): { night: SleepNightGroup | null; partial: SleepFragment | null } {
  const groups = analyzeSleep(samples).groups.filter((g) => Date.parse(g.wakeAt) <= now.getTime());
  const complete = groups.filter((g) => !g.partial);
  const night = complete.length > 0 ? complete[complete.length - 1] : null;
  const newer = groups.filter((g) => g.partial && (night == null || Date.parse(g.wakeAt) > Date.parse(night.wakeAt)));
  const p = newer.length > 0 ? newer[newer.length - 1] : null;
  return {
    night,
    partial: p ? { startAt: p.startAt, endAt: p.wakeAt, spanMin: Math.round((Date.parse(p.wakeAt) - Date.parse(p.startAt)) / 60000), asleepMin: Math.round(p.asleepMin) } : null,
  };
}

/**
 * Horas da "ultima noite" (Home): a noite COMPLETA (a mesma que a tela de Sono mostra) cujo acordar foi HOJE; sem ela, a de ONTEM (so ontem, nunca mais antiga). Minutos
 * iguais aos da tela para a mesma noite (os dois usam a uniao dos intervalos do MESMO grupo de amostras). Cochilo e trecho parcial nao contam. Sem noite = null.
 */
export function lastNightSleepHoursFromSamples(samples: readonly SleepSample[] | null | undefined, now: Date = new Date()): number | null {
  const todayKey = toDateKey(now);
  const yesterdayKey = toDateKey(addDays(startOfDay(now), -1));
  const complete = analyzeSleep(samples).groups.filter((g) => !g.partial && Date.parse(g.wakeAt) <= now.getTime());
  const pick = complete.find((g) => g.wakeDate === todayKey) ?? complete.find((g) => g.wakeDate === yesterdayKey);
  return pick ? pick.asleepMin / 60 : null;
}

/** Horas da noite completa que terminou HOJE (widget, so como reserva); sem ela = null (nao cai para ontem). */
export function sleepHoursWokenTodayFromSamples(samples: readonly SleepSample[] | null | undefined, now: Date = new Date()): number | null {
  const todayKey = toDateKey(now);
  const pick = analyzeSleep(samples).groups.find((g) => !g.partial && g.wakeDate === todayKey && Date.parse(g.wakeAt) <= now.getTime());
  return pick ? pick.asleepMin / 60 : null;
}

/** Campos de frescor do sono (fim e fonte da amostra de sono mais recente) para a leitura. */
function latestSampleFields(samples: readonly SleepSample[] | null | undefined, now: Date): { latestSampleEndAt: string | null; latestSampleSource: string | null } {
  const latest = latestSleepSample(samples, now);
  return { latestSampleEndAt: latest?.endAt ?? null, latestSampleSource: latest?.source ?? null };
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
    ...latestSampleFields(samples, now),
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
    ...latestSampleFields(samples, now),
  };
}

/** Intervalos (ms) de sono de verdade (dormindo, sem "na cama" nem acordado): usados para excluir essas horas do esforco da FC. */
export function asleepIntervals(samples: readonly SleepSample[] | null | undefined): { startMs: number; endMs: number }[] {
  return (samples ?? []).filter((s) => valid(s) && isAsleep(s)).map((s) => ({ startMs: s.startDate.getTime(), endMs: s.endDate.getTime() }));
}

/** Fim (ISO) e fonte da amostra de DORMINDO mais recente (qualquer sessao: noite, soneca ou trecho). "Na cama" sozinho nao conta (o iPhone grava isso sem o relogio ter sincronizado). Amostras que terminam no futuro (relogio errado) sao ignoradas quando `now` e dado. */
export function latestSleepSample(samples: readonly SleepSample[] | null | undefined, now?: Date): { endAt: string; source: string | null } | null {
  let best: SleepSample | null = null;
  for (const s of samples ?? []) {
    if (!valid(s) || !isAsleep(s)) continue;
    if (now && s.endDate.getTime() > now.getTime()) continue;
    if (!best || s.endDate.getTime() > best.endDate.getTime()) best = s;
  }
  return best ? { endAt: best.endDate.toISOString(), source: best.sourceName ?? best.sourceId ?? null } : null;
}

/** Fim (ISO) da amostra de sono mais recente; sem amostra = null. */
export function latestSleepSampleEnd(samples: readonly SleepSample[] | null | undefined, now?: Date): string | null {
  return latestSleepSample(samples, now)?.endAt ?? null;
}

/** A fonte e o Garmin Connect? (o nome da fonte do HealthKit contem "garmin") */
export function isGarminSource(source: string | null | undefined): boolean {
  return typeof source === 'string' && /garmin/i.test(source);
}

/** Depois desta hora (local) sem nenhum sono terminado hoje, o dado esta "velho" (antes dela a pessoa pode simplesmente ainda estar dormindo). */
export const SLEEP_STALE_AFTER_HOUR = 10;

export type SleepFreshness = { kind: 'fresh'; endedAt: string } | { kind: 'stale'; endedAt: string; daysAgo: number } | { kind: 'unknown' };

/**
 * Frescor do dado de sono: FRESCO se alguma amostra de sono terminou HOJE; VELHO se nenhuma terminou hoje e ja sao SLEEP_STALE_AFTER_HOUR (10h) ou mais (daysAgo = dias do
 * calendario desde o fim, 1 = ontem); DESCONHECIDO sem amostra, antes das 10h sem sono de hoje, ou data invalida (nao mostra rotulo).
 */
export function sleepFreshness(latestEndAt: string | null | undefined, now: Date = new Date()): SleepFreshness {
  if (!latestEndAt) return { kind: 'unknown' };
  const end = new Date(latestEndAt);
  if (Number.isNaN(end.getTime())) return { kind: 'unknown' };
  if (toDateKey(end) === toDateKey(now)) return { kind: 'fresh', endedAt: end.toISOString() };
  if (now.getHours() < SLEEP_STALE_AFTER_HOUR) return { kind: 'unknown' };
  const daysAgo = Math.round((startOfDay(now).getTime() - startOfDay(end).getTime()) / 86400000);
  return { kind: 'stale', endedAt: end.toISOString(), daysAgo: Math.max(1, daysAgo) };
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
