// HealthKit no app (iOS): logica PURA (sem React Native e sem a biblioteca nativa), testada no Node (Claude outputs/try_healthkit_app.mjs).
// services/healthkit.ts faz a parte de IO (chama @appeeky/expo-healthkit) e usa estas funcoes para normalizar o que a biblioteca devolve.
//
// Regras desta camada:
//  - Dado AUSENTE nunca vira zero: sem amostra = null (a tela mostra "--"); so um valor realmente medido aparece (inclusive um 0 medido).
//  - Dias e meses sao do aparelho (local), nunca UTC; o sono de uma noite entra no dia em que a pessoa ACORDOU.
//  - A FONTE do dado (Apple Watch, Garmin Connect, iPhone...) nao importa para o calculo: so aparece como rotulo informativo.
//  - O HealthKit NAO diz se a leitura foi negada (so devolve vazio): "negado" so aparece quando o sistema avisa (erro de autorizacao ou o pedido
//    recusado); vazio sem aviso e "sem dados".
import type { ActivityType, RoutePoint } from '@/services/activities';
import type {
  DailyQuantityPoint,
  DayHeartRateDetail,
  HealthHistoryGranularity,
  HealthHistoryPeriod,
  HealthHistoryPoint,
  HealthKitWorkout,
  HealthMetricHistory,
  HealthSummary,
  HeartRateIntradayPoint,
  SleepStage,
  SleepStageBreakdown,
  SleepStageSegment,
  WeekHeartRateDayPoint,
  WeekHeartRateDetail,
} from '@/services/health.types';

// ------------------------------------------------------------------------------------------------------------------ datas locais
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" no dia LOCAL do aparelho. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM" no mes LOCAL. */
export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Soma dias no calendario LOCAL (nao em multiplos de 24 h: o horario de verao nao desloca o dia). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/** Janela de um dia local: dayOffset 0 = hoje, 1 = ontem... */
export function dayWindow(dayOffset: number, now: Date = new Date()): { start: Date; end: Date } {
  const start = addDays(startOfDay(now), -dayOffset);
  return { start, end: endOfDay(start) };
}

/** Janela [start, end] + granularidade do periodo/offset (mesma semantica de _resolve_summary_window do backend: 1d, 7d, 4w diarios; 1y = 12 meses). */
export function resolveHistoryWindow(
  period: HealthHistoryPeriod,
  offset: number,
  now: Date = new Date()
): { start: Date; end: Date; granularity: HealthHistoryGranularity } {
  const today = startOfDay(now);
  if (period === '1d') {
    const end = addDays(today, -offset);
    return { start: end, end, granularity: 'day' };
  }
  if (period === '7d') {
    const end = addDays(today, -offset * 7);
    return { start: addDays(end, -6), end, granularity: 'day' };
  }
  if (period === '4w') {
    const end = addDays(today, -offset * 28);
    return { start: addDays(end, -27), end, granularity: 'day' };
  }
  const endOrdinal = today.getFullYear() * 12 + today.getMonth() - offset * 12;
  const startOrdinal = endOrdinal - 11;
  const start = new Date(Math.floor(startOrdinal / 12), ((startOrdinal % 12) + 12) % 12, 1);
  const end = new Date(Math.floor(endOrdinal / 12), (((endOrdinal % 12) + 12) % 12) + 1, 0);
  return { start, end, granularity: 'month' };
}

/** Chaves de cada dia (ou mes) da janela, em ordem; os buckets sem dado ficam com null no historico. */
export function buildBucketKeys(start: Date, end: Date, granularity: HealthHistoryGranularity): string[] {
  const keys: string[] = [];
  if (granularity === 'day') {
    let cursor = startOfDay(start);
    const last = startOfDay(end).getTime();
    while (cursor.getTime() <= last) {
      keys.push(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return keys;
  }
  let year = start.getFullYear();
  let month = start.getMonth();
  const endOrdinal = end.getFullYear() * 12 + end.getMonth();
  while (year * 12 + month <= endOrdinal) {
    keys.push(`${year}-${pad2(month + 1)}`);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return keys;
}

// ------------------------------------------------------------------------------------------------------ estatisticas (buckets)
/** Um bucket de HKStatisticsCollection como a biblioteca devolve: so os campos pedidos existem; sem amostra no periodo, nenhum. */
export interface StatBucket {
  startDate: Date;
  sum?: number | null;
  average?: number | null;
  min?: number | null;
  max?: number | null;
}

function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** bucket -> valor por chave (dia/mes). Bucket sem o campo = AUSENTE da mapa (nunca zero). */
export function bucketMap(buckets: readonly StatBucket[], field: 'sum' | 'average' | 'min' | 'max', keyOf: (d: Date) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of buckets ?? []) {
    if (!(b?.startDate instanceof Date) || Number.isNaN(b.startDate.getTime())) continue;
    const v = b[field];
    if (finiteNumber(v)) out.set(keyOf(b.startDate), v);
  }
  return out;
}

/** N dias consecutivos a partir de `start` (dia local): valor do mapa ou null. */
export function dailyPoints(byDay: Map<string, number>, start: Date, days: number): DailyQuantityPoint[] {
  const points: DailyQuantityPoint[] = [];
  for (let i = 0; i < days; i++) {
    const key = toDateKey(addDays(startOfDay(start), i));
    points.push({ date: key, value: byDay.has(key) ? (byDay.get(key) as number) : null });
  }
  return points;
}

/** Historico por periodo: um ponto por dia/mes da janela (null = sem dado) e a media so dos pontos COM dado. */
export function buildHistory(period: HealthHistoryPeriod, offset: number, byKey: Map<string, number>, now: Date = new Date()): HealthMetricHistory {
  const { start, end, granularity } = resolveHistoryWindow(period, offset, now);
  const points: HealthHistoryPoint[] = buildBucketKeys(start, end, granularity).map((key) => ({ date: key, value: byKey.has(key) ? (byKey.get(key) as number) : null }));
  const withData = points.filter((p): p is HealthHistoryPoint & { value: number } => p.value != null);
  const average = withData.length > 0 ? withData.reduce((sum, p) => sum + p.value, 0) / withData.length : null;
  return { period, granularity, offset, startDate: toDateKey(start), endDate: toDateKey(end), points, average };
}

// ------------------------------------------------------------------------------------------------------------ calorias: ativas + basal
/** Ha basal de verdade (> 0)? Basal ausente ou 0 (sem Apple Watch, sem permissao) = indisponivel: a energia ativa NUNCA e chamada de total. */
export function hasBasalEnergy(basalKcal: number | null | undefined): boolean {
  return typeof basalKcal === 'number' && Number.isFinite(basalKcal) && basalKcal > 0;
}

/** Divisao do dia: total so existe quando ha basal; sem basal, total = null e so a atividade e conhecida. */
export function energySplit(
  activeKcal: number | null | undefined,
  basalKcal: number | null | undefined
): { hasBasal: boolean; total: number | null; active: number | null; basal: number | null } {
  const active = typeof activeKcal === 'number' && Number.isFinite(activeKcal) ? activeKcal : null;
  const hasBasal = hasBasalEnergy(basalKcal);
  const basal = hasBasal ? (basalKcal as number) : null;
  return { hasBasal, total: hasBasal ? (active ?? 0) + (basal as number) : null, active, basal };
}

/**
 * Historico de calorias: por dia/mes, value = ativas + basal quando ha basal naquele ponto; sem basal, value = so as ativas (o tipo do ponto
 * guarda as duas partes para a tela dizer qual e qual). A media e a do value, so sobre os pontos com dado.
 */
export function buildCaloriesHistory(
  period: HealthHistoryPeriod,
  offset: number,
  activeByKey: Map<string, number>,
  basalByKey: Map<string, number>,
  now: Date = new Date()
): HealthMetricHistory {
  const valueByKey = new Map<string, number>();
  for (const key of new Set([...activeByKey.keys(), ...basalByKey.keys()])) {
    const split = energySplit(activeByKey.get(key), basalByKey.get(key));
    const value = split.total ?? split.active;
    if (value != null) valueByKey.set(key, value);
  }
  const history = buildHistory(period, offset, valueByKey, now);
  const points = history.points.map((p) => {
    const split = energySplit(activeByKey.get(p.date), basalByKey.get(p.date));
    return { ...p, active: split.active, basal: split.basal };
  });
  return { ...history, points };
}

/** Medias de ativas e basal sobre os mesmos pontos da media do value (soma = media do total quando ha basal em todos). basal null = nenhum ponto com basal. */
export function caloriesAverages(points: readonly HealthHistoryPoint[]): { active: number | null; basal: number | null } {
  const withData = points.filter((p) => p.value != null);
  if (withData.length === 0) return { active: null, basal: null };
  const anyBasal = withData.some((p) => hasBasalEnergy(p.basal));
  const active = withData.reduce((s, p) => s + (p.active ?? 0), 0) / withData.length;
  const basal = anyBasal ? withData.reduce((s, p) => s + (p.basal ?? 0), 0) / withData.length : null;
  return { active, basal };
}

export const roundBpm = (n: number | null | undefined): number | null => (finiteNumber(n) ? Math.round(n) : null);
export const round1 = (n: number | null | undefined): number | null => (finiteNumber(n) ? Math.round(n * 10) / 10 : null);

/** Pontos de FC do dia (media por faixa), so as faixas com dado. */
export function intradayPoints(buckets: readonly StatBucket[]): HeartRateIntradayPoint[] {
  const out: HeartRateIntradayPoint[] = [];
  for (const b of buckets ?? []) {
    if (!(b?.startDate instanceof Date) || !finiteNumber(b.average)) continue;
    out.push({ time: b.startDate.toISOString(), bpm: Math.round(b.average) });
  }
  return out;
}

export function dayHeartRate(date: Date, points: HeartRateIntradayPoint[], restingAvg: number | null | undefined, peakMax: number | null | undefined): DayHeartRateDetail {
  return { date: toDateKey(date), points, restingBpm: roundBpm(restingAvg), peakBpm: roundBpm(peakMax) };
}

/** 7 dias de FC: repouso (media) e pico (maximo) por dia; as medias da semana so sobre os dias COM dado. */
export function weekHeartRate(restingByDay: Map<string, number>, peakByDay: Map<string, number>, start: Date): WeekHeartRateDetail {
  const days: WeekHeartRateDayPoint[] = [];
  for (let i = 0; i < 7; i++) {
    const key = toDateKey(addDays(startOfDay(start), i));
    days.push({ date: key, restingBpm: restingByDay.has(key) ? roundBpm(restingByDay.get(key)) : null, peakBpm: peakByDay.has(key) ? roundBpm(peakByDay.get(key)) : null });
  }
  const avg = (vals: (number | null)[]) => {
    const real = vals.filter((v): v is number => v != null);
    return real.length > 0 ? Math.round(real.reduce((s, v) => s + v, 0) / real.length) : null;
  };
  return { days, avgRestingBpm: avg(days.map((d) => d.restingBpm)), avgPeakBpm: avg(days.map((d) => d.peakBpm)) };
}

// -------------------------------------------------------------------------------------------------------------------------- sono
export const SLEEP_LOOKBACK_HOURS = 32;
/** Pausa (sem nenhuma amostra de sono) a partir da qual comeca OUTRA sessao: tolera levantar no meio da noite sem partir a mesma noite em duas. */
export const SLEEP_SESSION_GAP_MINUTES = 90;

/** Valores de HKCategoryValueSleepAnalysis: 0 na cama, 1 dormindo (sem estagio), 2 acordado, 3 leve (core), 4 profundo, 5 REM. */
export interface SleepSample {
  startDate: Date;
  endDate: Date;
  value: number;
  sourceId?: string;
  sourceName?: string;
}

const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
const STAGE_VALUES = new Set([3, 4, 5]);

export function sleepStageOf(value: number): SleepStage | null {
  switch (value) {
    case 0:
      return 'inBed';
    case 2:
      return 'awake';
    case 1:
    case 3:
      return 'core';
    case 4:
      return 'deep';
    case 5:
      return 'rem';
    default:
      return null;
  }
}

const validSample = (s: SleepSample): boolean =>
  s?.startDate instanceof Date && s?.endDate instanceof Date && !Number.isNaN(s.startDate.getTime()) && !Number.isNaN(s.endDate.getTime()) && s.endDate.getTime() > s.startDate.getTime();

/** Agrupa em sessoes (noites/sonecas): ordena por inicio e corta quando a pausa passa de 90 min (usa o maior fim ja visto, tolerando sobreposicao). */
export function groupSleepSessions<T extends SleepSample>(samples: readonly T[]): T[][] {
  const sorted = (samples ?? []).filter(validSample).slice().sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const sessions: T[][] = [];
  let current: T[] = [];
  let maxEnd = 0;
  for (const s of sorted) {
    if (current.length === 0) {
      current = [s];
      maxEnd = s.endDate.getTime();
      continue;
    }
    const gapMin = (s.startDate.getTime() - maxEnd) / 60000;
    if (gapMin > SLEEP_SESSION_GAP_MINUTES) {
      sessions.push(current);
      current = [s];
      maxEnd = s.endDate.getTime();
    } else {
      current.push(s);
      maxEnd = Math.max(maxEnd, s.endDate.getTime());
    }
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

/** Minutos dormidos pela UNIAO dos intervalos de sono (varias fontes gravando o mesmo sono nao contam duas vezes). */
export function asleepMinutes(samples: readonly SleepSample[]): number {
  const iv = (samples ?? [])
    .filter((s) => validSample(s) && ASLEEP_VALUES.has(s.value))
    .map((s) => [s.startDate.getTime(), s.endDate.getTime()] as const)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = 0;
  let open = false;
  for (const [s, e] of iv) {
    if (!open) {
      curStart = s;
      curEnd = e;
      open = true;
    } else if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  if (open) total += curEnd - curStart;
  return total / 60000;
}

/** Horas dormidas de uma sessao (null se nao ha nenhum intervalo de sono). */
export function sleepHours(samples: readonly SleepSample[]): number | null {
  const m = asleepMinutes(samples);
  return m > 0 ? m / 60 : null;
}

/** Horas da sessao MAIS RECENTE (a ultima noite) nas amostras dadas; sem amostra ou sem sono = null (nunca 0). */
export function lastNightSleepHours(samples: readonly SleepSample[]): number | null {
  const sessions = groupSleepSessions(samples);
  if (sessions.length === 0) return null;
  return sleepHours(sessions[sessions.length - 1]);
}

/**
 * Quando mais de uma fonte grava o mesmo sono (ex.: relogio + app), usa para ESTAGIOS e linha do tempo so a fonte com mais minutos de estagio real
 * (profundo/leve/REM); sem nenhum estagio, mantem tudo (so "dormindo" e "na cama").
 */
export function preferStageSource<T extends SleepSample>(samples: readonly T[]): T[] {
  const bySource = new Map<string, number>();
  for (const s of samples) {
    if (!validSample(s) || !STAGE_VALUES.has(s.value)) continue;
    const key = s.sourceId ?? s.sourceName ?? '?';
    bySource.set(key, (bySource.get(key) ?? 0) + (s.endDate.getTime() - s.startDate.getTime()));
  }
  if (bySource.size <= 1) return samples.slice();
  const best = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return samples.filter((s) => (s.sourceId ?? s.sourceName ?? '?') === best);
}

export interface SleepNightDetail {
  /** Dia (local) em que a pessoa ACORDOU. */
  date: string;
  startedAt: string;
  endedAt: string;
  breakdown: SleepStageBreakdown;
  segments: SleepStageSegment[];
}

/** Detalhe de UMA sessao: minutos por estagio, linha do tempo e total dormido (uniao). Sessao sem nenhum estagio reconhecido = null. */
export function buildSleepNight(session: readonly SleepSample[]): SleepNightDetail | null {
  const valid = (session ?? []).filter(validSample);
  const staged = preferStageSource(valid);
  const breakdown: SleepStageBreakdown = { deepMinutes: 0, lightMinutes: 0, remMinutes: 0, awakeMinutes: 0, totalAsleepMinutes: 0 };
  const segments: SleepStageSegment[] = [];
  for (const s of staged) {
    const stage = sleepStageOf(s.value);
    if (!stage) continue;
    segments.push({ stage, startDate: s.startDate.toISOString(), endDate: s.endDate.toISOString() });
    const minutes = (s.endDate.getTime() - s.startDate.getTime()) / 60000;
    if (stage === 'deep') breakdown.deepMinutes += minutes;
    else if (stage === 'core') breakdown.lightMinutes += minutes;
    else if (stage === 'rem') breakdown.remMinutes += minutes;
    else if (stage === 'awake') breakdown.awakeMinutes += minutes;
  }
  if (segments.length === 0) return null;
  // Total dormido pela UNIAO de todas as fontes (nao pela soma por estagio): o mesmo sono gravado por duas fontes nao dobra.
  breakdown.totalAsleepMinutes = asleepMinutes(valid);
  const hasStageData = breakdown.deepMinutes > 0 || breakdown.lightMinutes > 0 || breakdown.remMinutes > 0;
  const timeline = hasStageData ? segments.filter((s) => s.stage !== 'inBed') : segments;
  const startedAt = segments.reduce((min, s) => (s.startDate < min ? s.startDate : min), segments[0].startDate);
  const endedAt = segments.reduce((max, s) => (s.endDate > max ? s.endDate : max), segments[0].endDate);
  return { date: toDateKey(new Date(endedAt)), startedAt, endedAt, breakdown, segments: timeline };
}

/** Detalhe da ultima noite (sessao mais recente). */
export function lastSleepNight(samples: readonly SleepSample[]): SleepNightDetail | null {
  const sessions = groupSleepSessions(samples);
  return sessions.length === 0 ? null : buildSleepNight(sessions[sessions.length - 1]);
}

/**
 * Horas dormidas por dia (ou mes), cada SESSAO atribuida ao dia em que a pessoa ACORDOU (uma noite que cruza a meia-noite nao se parte em dois
 * dias); sonecas entram no dia delas. Dia sem sono nao aparece (null no historico).
 */
export function sleepHoursByWakeDay(samples: readonly SleepSample[], granularity: HealthHistoryGranularity): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const session of groupSleepSessions(samples)) {
    const hours = sleepHours(session);
    if (hours == null) continue;
    const wake = new Date(Math.max(...session.map((s) => s.endDate.getTime())));
    const key = granularity === 'day' ? toDateKey(wake) : toMonthKey(wake);
    byKey.set(key, (byKey.get(key) ?? 0) + hours);
  }
  return byKey;
}

/**
 * Media de horas por NOITE em cada mes ("YYYY-MM"), a partir das horas por dia ("YYYY-MM-DD") de sleepHoursByWakeDay. Dias sem sono nao entram na
 * media; mes sem nenhum dia nao aparece. So as chaves de `onlyMonth` (quando dado) entram — usado pra consultar o HealthKit por faixas mensais.
 */
export function averageSleepByMonth(dayHours: ReadonlyMap<string, number>, onlyMonth?: string): Map<string, number> {
  const sums = new Map<string, { total: number; days: number }>();
  for (const [dayKey, hours] of dayHours) {
    const monthKey = dayKey.slice(0, 7);
    if (onlyMonth && monthKey !== onlyMonth) continue;
    const acc = sums.get(monthKey) ?? { total: 0, days: 0 };
    acc.total += hours;
    acc.days += 1;
    sums.set(monthKey, acc);
  }
  const result = new Map<string, number>();
  for (const [monthKey, { total, days }] of sums) result.set(monthKey, total / days);
  return result;
}

// ------------------------------------------------------------------------------------------------------------------ resumo
export function emptyHealthSummary(): HealthSummary {
  return {
    stepsToday: null,
    steps7d: null,
    distanceTodayMeters: null,
    distance7dMeters: null,
    activeEnergyTodayKcal: null,
    activeEnergy7dKcal: null,
    basalEnergyTodayKcal: null,
    basalEnergy7dKcal: null,
    heartRate: { mostRecentBpm: null, mostRecentAt: null, average7dBpm: null },
    sleepLastNightHours: null,
  };
}

/** O resumo tem ALGUM dado real (qualquer campo diferente de null)? Zero medido conta como dado. */
export function summaryHasData(s: HealthSummary): boolean {
  return [s.stepsToday, s.steps7d, s.distanceTodayMeters, s.distance7dMeters, s.activeEnergyTodayKcal, s.activeEnergy7dKcal, s.basalEnergyTodayKcal, s.basalEnergy7dKcal, s.heartRate.mostRecentBpm, s.heartRate.average7dBpm, s.sleepLastNightHours].some(
    (v) => v !== null && v !== undefined
  );
}

// ------------------------------------------------------------------------------------------------------------------ estados
export type HealthDataState = 'unavailable' | 'needs_permission' | 'denied' | 'no_data' | 'ok';

export interface HealthAccessInput {
  /** HealthKit existe neste aparelho (nao e Android, iPad antigo nem simulador sem Saude)? */
  available: boolean;
  /** Resultado de getRequestStatusForAuthorization: 'shouldRequest' = a pessoa ainda nao viu o pedido. */
  requestStatus?: 'shouldRequest' | 'unnecessary' | 'unknown';
  /** O pedido de permissao foi feito agora e o sistema o recusou/falhou. */
  requestFailed?: boolean;
  /** Alguma leitura falhou com erro de autorizacao do sistema. */
  authError?: boolean;
  /** Alguma leitura devolveu dado real. */
  anyData: boolean;
}

/**
 * Estado para a tela. O HealthKit nao informa leitura negada: sem aviso do sistema, vazio = "sem dados" (a tela explica que pode ser falta de dado
 * ou de permissao e oferece abrir Ajustes). Nunca mostra numero no lugar de um estado.
 */
export function classifyHealthAccess(i: HealthAccessInput): HealthDataState {
  if (!i.available) return 'unavailable';
  if (i.requestStatus === 'shouldRequest') return 'needs_permission';
  if (i.requestFailed || i.authError) return 'denied';
  return i.anyData ? 'ok' : 'no_data';
}

/** Erro de leitura causado por falta de autorizacao (mensagem do sistema/biblioteca). */
export function isAuthorizationError(err: unknown): boolean {
  const text = `${(err as { code?: unknown } | null)?.code ?? ''} ${(err as { message?: unknown } | null)?.message ?? ''}`;
  return /authori[sz]|not allowed|permission|denied/i.test(text);
}

/** Rotulo INFORMATIVO da fonte do dado (nao altera nenhum calculo): Apple Watch/iPhone, Garmin Connect ou o nome que a fonte informou. */
export function sourceLabel(sourceId?: string | null, sourceName?: string | null): string | null {
  const id = typeof sourceId === 'string' ? sourceId : '';
  const name = typeof sourceName === 'string' ? sourceName.trim() : '';
  if (/^com\.garmin\./i.test(id) || /garmin/i.test(name)) return 'Garmin Connect';
  if (/^com\.apple\.health(\.|$)/i.test(id)) return /watch/i.test(name) ? 'Apple Watch' : name !== '' ? name : 'iPhone';
  return name !== '' ? name : null;
}

// ------------------------------------------------------------------------------------------------------------------ treinos
/** Valores de HKWorkoutActivityType que o app reconhece; o resto vira "other" (mesma lista de antes). */
const WORKOUT_TYPE_MAP: Record<number, ActivityType> = {
  37: 'run', // running
  13: 'bike', // cycling
  74: 'bike', // handCycling
  46: 'swim', // swimming
  8: 'fight', // boxing
  65: 'fight', // kickboxing
  28: 'fight', // martialArts
  56: 'fight', // wrestling
  63: 'hiit', // highIntensityIntervalTraining
};

export function mapWorkoutActivity(raw: unknown): ActivityType {
  return typeof raw === 'number' && WORKOUT_TYPE_MAP[raw] ? WORKOUT_TYPE_MAP[raw] : 'other';
}

export interface WorkoutRaw {
  uuid: string;
  startDate: Date;
  endDate: Date;
  /** Segundos. */
  duration: number;
  workoutActivityType: number;
  totalEnergyBurned?: number | null;
  totalDistance?: number | null;
  totalDistanceUnit?: string | null;
  sourceId?: string | null;
}

export interface RouteLocation {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  timestamp: Date;
}

/** Junta os trechos de rota (um treino pode ter varios, ex.: pausas) em ordem de inicio; sem ponto valido = null (sem rota; nunca lista vazia). */
export function routePointsFrom(routes: readonly { startDate: Date; locations: readonly RouteLocation[] }[] | null | undefined): RoutePoint[] | null {
  const ordered = (routes ?? []).slice().sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const points: RoutePoint[] = [];
  for (const route of ordered) {
    for (const l of route.locations ?? []) {
      if (!finiteNumber(l.latitude) || !finiteNumber(l.longitude) || Math.abs(l.latitude) > 90 || Math.abs(l.longitude) > 180) continue;
      if (!(l.timestamp instanceof Date) || Number.isNaN(l.timestamp.getTime())) continue;
      points.push({ lat: l.latitude, lng: l.longitude, timestamp: l.timestamp.toISOString(), alt: finiteNumber(l.altitude) ? l.altitude : null });
    }
  }
  return points.length > 0 ? points : null;
}

/** Treino da biblioteca -> HealthKitWorkout do app. Distancia/calorias ausentes = null (nunca 0); rota so se veio. */
export function toHealthKitWorkout(w: WorkoutRaw, routePoints: RoutePoint[] | null): HealthKitWorkout {
  const km = (w.totalDistanceUnit ?? 'm') === 'km';
  return {
    id: w.uuid,
    activityType: mapWorkoutActivity(w.workoutActivityType),
    startedAt: w.startDate.toISOString(),
    finishedAt: w.endDate.toISOString(),
    durationSeconds: Math.max(0, Math.round(finiteNumber(w.duration) ? w.duration : (w.endDate.getTime() - w.startDate.getTime()) / 1000)),
    distanceMeters: finiteNumber(w.totalDistance) && w.totalDistance > 0 ? (km ? w.totalDistance * 1000 : w.totalDistance) : null,
    caloriesBurned: finiteNumber(w.totalEnergyBurned) && w.totalEnergyBurned > 0 ? w.totalEnergyBurned : null,
    routePoints,
    sourceId: w.sourceId ?? undefined,
  };
}

// ----------------------------------------------------------------- leitura incremental de treinos (sem consulta ancorada)
// A biblioteca so tem consulta ancorada para QUANTIDADES, nao para treinos. A importacao incremental usa uma "marca d'agua" por data: o fim do treino
// mais recente ja visto, guardada como "w1:<ISO>". Como relogios (Garmin Connect, por exemplo) podem entregar treinos horas depois de terminarem, a
// busca volta alguns dias antes da marca; o backend e idempotente por external_id (nada duplica) e o app ignora o que ja importou.
export const WORKOUT_ANCHOR_PREFIX = 'w1:';
export const WORKOUT_LOOKBACK_DAYS = 3;

export function makeWorkoutAnchor(date: Date): string {
  return `${WORKOUT_ANCHOR_PREFIX}${date.toISOString()}`;
}

/** Marca d'agua guardada, ou null se nao ha / nao e deste formato (anchors antigos da outra biblioteca sao ignorados). */
export function parseWorkoutAnchor(anchor: unknown): Date | null {
  if (typeof anchor !== 'string' || !anchor.startsWith(WORKOUT_ANCHOR_PREFIX)) return null;
  const d = new Date(anchor.slice(WORKOUT_ANCHOR_PREFIX.length));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inicio da janela: sem marca d'agua = fallbackSince; com marca = o mais tardio entre fallbackSince e (marca - 3 dias). */
export function incrementalWindowStart(anchor: unknown, fallbackSince: Date): Date {
  const mark = parseWorkoutAnchor(anchor);
  if (!mark) return fallbackSince;
  const back = new Date(mark.getTime() - WORKOUT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return back.getTime() > fallbackSince.getTime() ? back : fallbackSince;
}

/** Nova marca d'agua: o fim mais recente entre a marca anterior e os treinos vistos; nunca anda para tras; sem nada = a marca atual (ou null). */
export function nextWorkoutAnchor(anchor: unknown, workouts: readonly { finishedAt: string }[]): string | null {
  let latest = parseWorkoutAnchor(anchor);
  for (const w of workouts ?? []) {
    const d = new Date(w.finishedAt);
    if (!Number.isNaN(d.getTime()) && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  return latest ? makeWorkoutAnchor(latest) : null;
}
