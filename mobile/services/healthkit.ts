/**
 * HealthKit (Apple Saude, iOS) sobre @appeeky/expo-healthkit (Expo Modules API, sem Nitro). Substitui o stub temporario: mesmas exports e
 * assinaturas, para services/health.ts (fachada) e toda a UI continuarem iguais.
 *
 * SO LEITURA: o app nunca grava no HealthKit (toShare sempre vazio; nenhuma funcao de escrita da biblioteca e chamada). Tipos lidos: sono, frequencia
 * cardiaca, frequencia em repouso, respiracao, passos, distancia (caminhada/corrida), energia ativa, treinos e a ROTA GPS dos treinos. Entrega em
 * segundo plano so para treinos.
 *
 * A logica pura (janelas de data locais, sono por noite, agregacoes, estados, mapeamento de treinos) esta em services/healthkitState.ts e e testada
 * no Node. Aqui fica so o IO com a biblioteca. Funciona com qualquer FONTE de dado (Apple Watch, Garmin Connect, iPhone...): a fonte so vira rotulo
 * informativo (sourceLabel). Dado ausente = null/vazio, nunca zero; erro de leitura vira ausente, sem derrubar o resto.
 *
 * LIMITES CONHECIDOS (nao testado em aparelho): o HealthKit nao informa se a leitura foi negada (so devolve vazio); a biblioteca nao tem consulta
 * ancorada para treinos (a importacao incremental usa uma marca d'agua por data, ver healthkitState.ts); e o simulador nao entrega dados em segundo plano.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { HealthKitWorkout } from './health.types';
import type {
  DailyQuantityPoint,
  DayHeartRateDetail,
  HealthHistoryPeriod,
  HealthMetricHistory,
  HealthMetricKey,
  HealthSummary,
  HeartRateSamplePoint,
  SleepSessionDetail,
  WeekHeartRateDetail,
} from './health.types';
import {
  HealthDataState,
  SLEEP_LOOKBACK_HOURS,
  SleepSample,
  StatBucket,
  addDays,
  bucketMap,
  buildHistory,
  classifyHealthAccess,
  dailyPoints,
  dayHeartRate,
  dayWindow,
  emptyHealthSummary,
  endOfDay,
  incrementalWindowStart,
  intradayPoints,
  isAuthorizationError,
  lastNightSleepHours,
  lastSleepNight,
  nextWorkoutAnchor,
  resolveHistoryWindow,
  roundBpm,
  round1,
  routePointsFrom,
  sleepHoursByWakeDay,
  sourceLabel,
  startOfDay,
  summaryHasData,
  toDateKey,
  toHealthKitWorkout,
  toMonthKey,
  weekHeartRate,
} from './healthkitState';

export const HEALTHKIT_CONNECTED_KEY = 'healthkit_connected';

// Identificadores do HealthKit (mesmas strings das constantes da biblioteca; ficam aqui para a lista de permissao nao depender de carregar o modulo nativo).
const T_WORKOUT = 'HKWorkoutTypeIdentifier';
const T_ROUTE = 'HKWorkoutRouteTypeIdentifier';
const T_HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const T_RESTING_HR = 'HKQuantityTypeIdentifierRestingHeartRate';
const T_RESPIRATORY = 'HKQuantityTypeIdentifierRespiratoryRate';
const T_STEPS = 'HKQuantityTypeIdentifierStepCount';
const T_DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
const T_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const T_SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';

/** Lista UNICA de leitura (pedido de permissao e checagem usam a MESMA lista). Nada de escrita. */
export const HEALTHKIT_READ_TYPES: readonly string[] = [T_WORKOUT, T_ROUTE, T_HEART_RATE, T_RESTING_HR, T_RESPIRATORY, T_STEPS, T_DISTANCE, T_ENERGY, T_SLEEP];

type HK = typeof import('@appeeky/expo-healthkit').default;

let cachedLib: HK | null | undefined;

/** A biblioteca so existe no iOS (no Android o Health Connect e outro caminho): carrega sob demanda e nunca derruba o app. */
function hk(): HK | null {
  if (cachedLib !== undefined) return cachedLib;
  if (Platform.OS !== 'ios') {
    cachedLib = null;
    return cachedLib;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedLib = (require('@appeeky/expo-healthkit') as { default: HK }).default;
  } catch {
    cachedLib = null;
  }
  return cachedLib;
}

let authErrorSeen = false;

/** Roda uma leitura e engole falha (transitoria ou tipo nao autorizado) virando null; lembra se foi erro de autorizacao. */
async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isAuthorizationError(error)) authErrorSeen = true;
    return null;
  }
}

const dayMs = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------------------------------------------------ disponibilidade e permissao
export async function isHealthKitAvailable(): Promise<boolean> {
  const h = hk();
  return !!h && h.isAvailable();
}

export async function requestHealthKitPermissions(): Promise<boolean> {
  const h = hk();
  if (!h || !h.isAvailable()) return false;
  try {
    return await h.requestAuthorization({ toRead: [...HEALTHKIT_READ_TYPES] }); // so leitura: toShare vazio
  } catch (error) {
    if (isAuthorizationError(error)) authErrorSeen = true;
    return false;
  }
}

/** A pessoa ja viu o pedido de TODOS os tipos da lista (nao diz se aceitou: o HealthKit nao informa leitura negada). */
export async function isHealthKitReallyAuthorized(): Promise<boolean> {
  const h = hk();
  if (!h || !h.isAvailable()) return false;
  const status = await safe(h.getRequestStatusForAuthorization({ toRead: [...HEALTHKIT_READ_TYPES] }));
  return status === h.AuthorizationRequestStatus.unnecessary;
}

/** Segue direto se ja autorizou; se so falta um tipo novo e a flag local diz "ja conectei", re-pede sozinho (so aparecem os tipos novos). */
export async function ensureHealthKitAuthorized(): Promise<boolean> {
  if (await isHealthKitReallyAuthorized()) return true;
  const alreadyConnectedFlag = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
  if (!alreadyConnectedFlag) return false;
  const granted = await requestHealthKitPermissions();
  if (!granted) return false;
  return isHealthKitReallyAuthorized();
}

/**
 * Estado explicito para a tela: nao disponivel (Android/iPad sem Saude/simulador), precisa pedir permissao, negada (so quando o sistema avisa), sem
 * dados ou ok. Faz uma leitura de teste do resumo; nao pede permissao nem escreve nada.
 */
export async function getHealthKitAccessState(): Promise<HealthDataState> {
  const h = hk();
  if (!h || !h.isAvailable()) return 'unavailable';
  authErrorSeen = false;
  const raw = await safe(h.getRequestStatusForAuthorization({ toRead: [...HEALTHKIT_READ_TYPES] }));
  const requestStatus =
    raw === h.AuthorizationRequestStatus.shouldRequest ? 'shouldRequest' : raw === h.AuthorizationRequestStatus.unnecessary ? 'unnecessary' : 'unknown';
  if (requestStatus === 'shouldRequest') return classifyHealthAccess({ available: true, requestStatus, anyData: false });
  const summary = await fetchHealthSummary();
  return classifyHealthAccess({ available: true, requestStatus, authError: authErrorSeen, anyData: summaryHasData(summary) });
}

// -------------------------------------------------------------------------------------------------------------------------- treinos
async function readWorkouts(from: Date): Promise<HealthKitWorkout[]> {
  const h = hk();
  if (!h || !h.isAvailable()) return [];
  const samples = await h.queryWorkouts({ from, ascending: false, limit: 0 });
  const results: HealthKitWorkout[] = [];
  for (const w of samples) {
    let routePoints = null;
    try {
      const routes = await h.queryWorkoutRoute({ workoutUUID: w.uuid });
      routePoints = routePointsFrom(routes.map((r) => ({ startDate: r.startDate, locations: r.locations })));
    } catch {
      routePoints = null; // treino sem rota (ou rota nao autorizada): segue sem rota
    }
    results.push(
      toHealthKitWorkout(
        {
          uuid: w.uuid,
          startDate: w.startDate,
          endDate: w.endDate,
          duration: w.duration,
          workoutActivityType: w.workoutActivityType,
          totalEnergyBurned: w.totalEnergyBurned,
          totalDistance: w.totalDistance,
          totalDistanceUnit: w.totalDistanceUnit,
          sourceId: w.sourceId,
        },
        routePoints
      )
    );
  }
  return results;
}

/** Treinos do HealthKit desde a data, mais recentes primeiro (qualquer fonte). */
export async function fetchRecentWorkouts(sinceDate: Date): Promise<HealthKitWorkout[]> {
  return readWorkouts(sinceDate);
}

/**
 * Leitura incremental para a importacao automatica. A biblioteca nao tem consulta ancorada para treinos, entao o "anchor" aqui e uma marca d'agua
 * por data ("w1:<ISO>", ver healthkitState.ts): busca desde 3 dias antes da marca (relogios podem entregar treinos atrasados) e devolve a nova marca.
 * Duplicatas sao evitadas pelo app e pela idempotencia do servidor (external_id). Anchors do formato antigo sao ignorados (cai em fallbackSince).
 */
export async function fetchWorkoutsSinceAnchor(
  anchor: string | null,
  fallbackSince: Date
): Promise<{ workouts: HealthKitWorkout[]; newAnchor: string | null }> {
  const workouts = await readWorkouts(incrementalWindowStart(anchor, fallbackSince));
  return { workouts, newAnchor: nextWorkoutAnchor(anchor, workouts) };
}

/**
 * Entrega em segundo plano so para TREINOS (imediata). O callback pode devolver uma Promise: o iOS so recebe o "terminei" quando ela acaba, entao
 * o sistema nao suspende o app no meio da importacao. Devolve a funcao que remove a assinatura.
 */
export async function setupBackgroundWorkoutDelivery(onUpdate: () => void | Promise<void>): Promise<() => void> {
  const h = hk();
  if (!h || !h.isAvailable()) return () => {};
  await h.enableBackgroundDelivery(T_WORKOUT, h.UpdateFrequency.immediate);
  await h.observe([T_WORKOUT]);
  const subscription = h.addUpdateListener(async () => {
    await onUpdate();
  });
  return () => subscription.remove();
}

// ---------------------------------------------------------------------------------------------------------------- frequencia cardiaca
async function recentHeartRate(): Promise<{ bpm: number; at: Date } | null> {
  const h = hk();
  if (!h) return null;
  const samples = await h.queryQuantitySamples({ type: T_HEART_RATE, unit: 'count/min', limit: 1, ascending: false });
  const s = samples[0];
  return s ? { bpm: Math.round(s.value), at: s.endDate } : null;
}

async function heartRateSummary(since: Date): Promise<HealthSummary['heartRate']> {
  const h = hk();
  if (!h) return emptyHealthSummary().heartRate;
  const [recent, stats] = await Promise.all([
    safe(recentHeartRate()),
    safe(h.queryStatistics({ type: T_HEART_RATE, unit: 'count/min', from: since, options: h.StatisticsOption.discreteAverage })),
  ]);
  return { mostRecentBpm: recent ? recent.bpm : null, mostRecentAt: recent ? recent.at.toISOString() : null, average7dBpm: roundBpm(stats?.average) };
}

/** Amostras BRUTAS de FC desde a data (da mais antiga para a mais nova, ate 500) para o POST /heart-rate/sync. */
export async function fetchHeartRateSamplesSince(sinceDate: Date): Promise<HeartRateSamplePoint[]> {
  const h = hk();
  if (!h || !h.isAvailable()) return [];
  const samples = await safe(h.queryQuantitySamples({ type: T_HEART_RATE, unit: 'count/min', from: sinceDate, limit: 500, ascending: true }));
  return (samples ?? []).map((s) => ({ bpm: Math.round(s.value), recordedAt: s.endDate.toISOString() }));
}

/** Leitura mais recente de FC, so se tiver no maximo maxAgeMs (usada durante uma atividade ao vivo); sem fonte gravando agora = null. */
export async function fetchRecentHeartRateBpm(maxAgeMs: number): Promise<number | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const recent = await safe(recentHeartRate());
  if (!recent) return null;
  return Date.now() - recent.at.getTime() > maxAgeMs ? null : recent.bpm;
}

export async function fetchAverageHeartRate(start: Date, end: Date): Promise<number | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const stats = await safe(h.queryStatistics({ type: T_HEART_RATE, unit: 'count/min', from: start, to: end, options: h.StatisticsOption.discreteAverage }));
  return roundBpm(stats?.average);
}

// -------------------------------------------------------------------------------------------------------------------------------- sono
async function readSleepSamples(from: Date, to?: Date): Promise<SleepSample[]> {
  const h = hk();
  if (!h) return [];
  const samples = await h.queryCategorySamples({ type: T_SLEEP, from, to, limit: 0, ascending: true });
  return samples.map((s) => ({ startDate: s.startDate, endDate: s.endDate, value: s.value, sourceId: s.sourceId, sourceName: s.sourceName }));
}

/** Horas da ultima noite (sessao mais recente das ultimas 32 h); sem dado de sono = null. */
export async function fetchLastNightSleepHours(): Promise<number | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const samples = await safe(readSleepSamples(new Date(Date.now() - (SLEEP_LOOKBACK_HOURS / 24) * dayMs)));
  return samples ? lastNightSleepHours(samples) : null;
}

/** Detalhe da ultima noite (estagios, linha do tempo, FC e respiracao durante o sono). Sem sono = null. */
export async function fetchSleepSessionDetail(): Promise<SleepSessionDetail | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const samples = await safe(readSleepSamples(new Date(Date.now() - (SLEEP_LOOKBACK_HOURS / 24) * dayMs)));
  const night = samples ? lastSleepNight(samples) : null;
  if (!night) return null;
  const from = new Date(night.startedAt);
  const to = new Date(night.endedAt);
  const [hr, resp] = await Promise.all([
    safe(h.queryStatistics({ type: T_HEART_RATE, unit: 'count/min', from, to, options: h.StatisticsOption.discreteAverage | h.StatisticsOption.discreteMin })),
    safe(h.queryStatistics({ type: T_RESPIRATORY, unit: 'count/min', from, to, options: h.StatisticsOption.discreteAverage | h.StatisticsOption.discreteMin })),
  ]);
  return {
    date: night.date,
    startedAt: night.startedAt,
    endedAt: night.endedAt,
    breakdown: night.breakdown,
    segments: night.segments,
    heartRate: { average: roundBpm(hr?.average), lowest: roundBpm(hr?.min) },
    respiratoryRate: { average: round1(resp?.average), lowest: round1(resp?.min) },
  };
}

/** Rotulo informativo da fonte do sono mais recente ("Garmin Connect", "Apple Watch"...); null se nao ha. Nada depende disso. */
export async function fetchSleepSourceLabel(): Promise<string | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const samples = await safe(readSleepSamples(new Date(Date.now() - (SLEEP_LOOKBACK_HOURS / 24) * dayMs)));
  const last = samples && samples.length > 0 ? samples[samples.length - 1] : null;
  return last ? sourceLabel(last.sourceId, last.sourceName) : null;
}

// ------------------------------------------------------------------------------------------------------------------ passos, energia, resumo
async function statsBuckets(
  type: string,
  unit: string,
  from: Date,
  to: Date,
  option: number,
  interval: { day?: number; month?: number; minute?: number }
): Promise<StatBucket[]> {
  const h = hk();
  if (!h) return [];
  const rows = await h.queryStatisticsCollection({ type, unit, from, to, options: option, interval });
  return rows.map((r) => ({ startDate: r.startDate, sum: r.sum, average: r.average, min: r.min, max: r.max }));
}

async function dailyQuantityLast7Days(type: string, unit: string): Promise<DailyQuantityPoint[]> {
  const h = hk();
  const start = addDays(startOfDay(new Date()), -6);
  if (!h || !h.isAvailable()) return dailyPoints(new Map(), start, 7);
  const buckets = (await safe(statsBuckets(type, unit, start, new Date(), h.StatisticsOption.cumulativeSum, { day: 1 }))) ?? [];
  return dailyPoints(bucketMap(buckets, 'sum', toDateKey), start, 7);
}

export async function fetchStepsLast7Days(): Promise<DailyQuantityPoint[]> {
  return dailyQuantityLast7Days(T_STEPS, 'count');
}

export async function fetchActiveEnergyLast7Days(): Promise<DailyQuantityPoint[]> {
  return dailyQuantityLast7Days(T_ENERGY, 'kcal');
}

async function sumSince(type: string, unit: string, since: Date): Promise<number | null> {
  const h = hk();
  if (!h) return null;
  const stats = await h.queryStatistics({ type, unit, from: since, options: h.StatisticsOption.cumulativeSum });
  return typeof stats.sum === 'number' ? stats.sum : null;
}

/** Resumo do que houver no Apple Saude, de qualquer fonte. Cada metrica falha sozinha (fica null); sem permissao ou sem dado, tudo null. */
export async function fetchHealthSummary(): Promise<HealthSummary> {
  const h = hk();
  if (!h || !h.isAvailable()) return emptyHealthSummary();
  const today = startOfDay(new Date());
  const sevenDaysAgo = new Date(Date.now() - 7 * dayMs);
  const [stepsToday, steps7d, distanceTodayMeters, distance7dMeters, activeEnergyTodayKcal, activeEnergy7dKcal, heartRate, sleepLastNightHours] = await Promise.all([
    safe(sumSince(T_STEPS, 'count', today)),
    safe(sumSince(T_STEPS, 'count', sevenDaysAgo)),
    safe(sumSince(T_DISTANCE, 'm', today)),
    safe(sumSince(T_DISTANCE, 'm', sevenDaysAgo)),
    safe(sumSince(T_ENERGY, 'kcal', today)),
    safe(sumSince(T_ENERGY, 'kcal', sevenDaysAgo)),
    safe(heartRateSummary(sevenDaysAgo)),
    safe(fetchLastNightSleepHours()),
  ]);
  return {
    stepsToday,
    steps7d,
    distanceTodayMeters,
    distance7dMeters,
    activeEnergyTodayKcal,
    activeEnergy7dKcal,
    heartRate: heartRate ?? emptyHealthSummary().heartRate,
    sleepLastNightHours,
  };
}

// ----------------------------------------------------------------------------------------------------------------- historico por periodo
export async function fetchHealthMetricHistory(metric: HealthMetricKey, period: HealthHistoryPeriod, offset = 0): Promise<HealthMetricHistory> {
  const { start, end, granularity } = resolveHistoryWindow(period, offset);
  const h = hk();
  const keyOf = granularity === 'day' ? toDateKey : toMonthKey;
  if (!h || !h.isAvailable()) return buildHistory(period, offset, new Map());
  const interval = granularity === 'day' ? { day: 1 } : { month: 1 };
  let byKey = new Map<string, number>();
  if (metric === 'sleep') {
    const samples = await safe(readSleepSamples(addDays(start, -1), addDays(end, 1)));
    byKey = samples ? sleepHoursByWakeDay(samples, granularity) : new Map();
  } else {
    const spec =
      metric === 'steps'
        ? { type: T_STEPS, unit: 'count', option: h.StatisticsOption.cumulativeSum, field: 'sum' as const }
        : metric === 'calories'
          ? { type: T_ENERGY, unit: 'kcal', option: h.StatisticsOption.cumulativeSum, field: 'sum' as const }
          : { type: T_HEART_RATE, unit: 'count/min', option: h.StatisticsOption.discreteAverage, field: 'average' as const };
    const buckets = await safe(statsBuckets(spec.type, spec.unit, start, endOfDay(end), spec.option, interval));
    byKey = buckets ? bucketMap(buckets, spec.field, keyOf) : new Map();
  }
  return buildHistory(period, offset, byKey);
}

export async function fetchDayHeartRateDetail(dayOffset = 0): Promise<DayHeartRateDetail> {
  const { start, end } = dayWindow(dayOffset);
  const h = hk();
  if (!h || !h.isAvailable()) return dayHeartRate(start, [], null, null);
  const [buckets, resting, peak] = await Promise.all([
    safe(statsBuckets(T_HEART_RATE, 'count/min', start, end, h.StatisticsOption.discreteAverage, { minute: 10 })),
    safe(h.queryStatistics({ type: T_RESTING_HR, unit: 'count/min', from: start, to: end, options: h.StatisticsOption.discreteAverage })),
    safe(h.queryStatistics({ type: T_HEART_RATE, unit: 'count/min', from: start, to: end, options: h.StatisticsOption.discreteMax })),
  ]);
  return dayHeartRate(start, intradayPoints(buckets ?? []), resting?.average, peak?.max);
}

export async function fetchWeekHeartRateDetail(weekOffset = 0): Promise<WeekHeartRateDetail> {
  const end = addDays(startOfDay(new Date()), -weekOffset * 7);
  const start = addDays(end, -6);
  const h = hk();
  if (!h || !h.isAvailable()) return weekHeartRate(new Map(), new Map(), start);
  const [resting, peak] = await Promise.all([
    safe(statsBuckets(T_RESTING_HR, 'count/min', start, endOfDay(end), h.StatisticsOption.discreteAverage, { day: 1 })),
    safe(statsBuckets(T_HEART_RATE, 'count/min', start, endOfDay(end), h.StatisticsOption.discreteMax, { day: 1 })),
  ]);
  return weekHeartRate(bucketMap(resting ?? [], 'average', toDateKey), bucketMap(peak ?? [], 'max', toDateKey), start);
}
