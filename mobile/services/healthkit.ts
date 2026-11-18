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
  SleepScreenData,
  SleepSessionDetail,
  WeekHeartRateDetail,
} from './health.types';
import {
  HealthDataState,
  SleepSample,
  StatBucket,
  addDays,
  bucketMap,
  buildCaloriesHistory,
  buildHistory,
  buildSleepNight,
  classifyHealthAccess,
  dailyPoints,
  dayHeartRate,
  dayWindow,
  emptyHealthSummary,
  endOfDay,
  incrementalWindowStart,
  intradayPoints,
  isAuthorizationError,
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
import {
  SLEEP_QUALITY_LOOKBACK_DAYS,
  SLEEP_SCREEN_LOOKBACK_HOURS,
  describeSleepSessions,
  latestSleepSample,
  lastNightSleepHoursFromSamples,
  napMinutesSince,
  selectSleepNightForScreen,
  sleepCycleReading,
  sleepHoursWokenTodayFromSamples,
} from './sleepNights';
import type { SleepSessionInfo } from './sleepNights';
import type { SleepQualityReading } from './sleepNights';
import type { DayInput, WorkoutInput } from './vitalityDynamic';
import { mergeOverlappingWorkouts, resolveWorkoutKcal } from './workoutWindows';
import type { HistoryDay } from './vitalityEngine';

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
const T_BASAL = 'HKQuantityTypeIdentifierBasalEnergyBurned';
const T_SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';

/** Lista UNICA de leitura (pedido de permissao e checagem usam a MESMA lista). Nada de escrita. */
export const HEALTHKIT_READ_TYPES: readonly string[] = [T_WORKOUT, T_ROUTE, T_HEART_RATE, T_RESTING_HR, T_RESPIRATORY, T_STEPS, T_DISTANCE, T_ENERGY, T_BASAL, T_SLEEP];

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

/**
 * Horas de sono da "ultima noite": a noite COMPLETA que a tela de Sono mostra (noite principal, sem soneca e sem trecho parcial; uma noite quebrada por pausa de mais de
 * 90 min continua sendo uma noite) cujo acordar foi HOJE; se ainda nao ha, a de ONTEM (so ontem, nunca mais antiga). Mesmos minutos da tela de Sono para a mesma noite
 * (sleepNights.ts:lastNightSleepHoursFromSamples). Sem dado = null. Usada pela Home, pela Vitalidade e pela prontidao (sleepLastNightHours).
 */
export async function fetchLastNightSleepHours(): Promise<number | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const now = new Date();
  // Comeca 2 dias antes de hoje 00:00: uma noite que termina ontem pode ter comecado na noite anterior a ontem.
  const samples = await safe(readSleepSamples(addDays(startOfDay(now), -2)));
  if (!samples) return null;
  return lastNightSleepHoursFromSamples(samples, now);
}

/**
 * Horas da noite COMPLETA que terminou HOJE (mesma selecao da tela de Sono: sem soneca e sem trecho parcial). Sem ela = null (antes de acordar nao mostra a noite de
 * ontem). Usada pelo widget so como reserva; fetchLastNightSleepHours (Home/Vitalidade) usa a mesma selecao, com fallback para ontem.
 */
export async function fetchSleepHoursWokenToday(): Promise<number | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const now = new Date();
  const samples = await safe(readSleepSamples(addDays(startOfDay(now), -1)));
  if (!samples) return null;
  return sleepHoursWokenTodayFromSamples(samples, now);
}

/**
 * Qualidade do sono (0-100, estimativa de bem-estar calculada AQUI, no aparelho) da noite que terminou hoje; sem ela, a de ontem marcada como
 * provisoria (isToday = false); sem noite = null. So LEITURA do Apple Saude: nada e enviado a lugar nenhum. A logica e pura e testada em
 * sleepNights.ts / sleepQuality.ts; aqui so o IO. Le os ultimos SLEEP_QUALITY_LOOKBACK_DAYS dias (7 noites + folga) para divida e regularidade.
 */
export async function fetchSleepQualityReading(): Promise<SleepQualityReading | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const now = new Date();
  const samples = await safe(readSleepSamples(addDays(startOfDay(now), -SLEEP_QUALITY_LOOKBACK_DAYS)));
  if (!samples) return null;
  return sleepCycleReading(samples, now);
}

/**
 * Dados da tela de Sono: o detalhe da ultima noite COMPLETA (estagios, linha do tempo, FC e respiracao durante o sono) e, se houver, o trecho parcial mais novo que ela
 * (sincronizacao incompleta). Le SLEEP_SCREEN_LOOKBACK_HOURS (72 h, antes 32 h): o HealthKit filtra por INICIO de amostra, e uma janela curta deixava so a cauda de uma
 * noite. A selecao (noite principal, nao parcial) e pura e compartilhada com a Home e a Vitalidade (sleepNights.ts). Sem sono = { detail: null, partial: null }.
 */
export async function fetchSleepScreenData(): Promise<SleepScreenData> {
  const empty: SleepScreenData = { detail: null, partial: null, latestSampleEndAt: null, latestSampleSource: null };
  const h = hk();
  if (!h || !h.isAvailable()) return empty;
  const now = new Date();
  const samples = await safe(readSleepSamples(new Date(now.getTime() - SLEEP_SCREEN_LOOKBACK_HOURS * 60 * 60 * 1000)));
  if (!samples) return empty;
  const { night: group, partial } = selectSleepNightForScreen(samples, now);
  const latest = latestSleepSample(samples, now);
  const latestFields = { latestSampleEndAt: latest?.endAt ?? null, latestSampleSource: latest?.source ?? null };
  const partialInfo = partial ? { startedAt: partial.startAt, endedAt: partial.endAt, spanMinutes: partial.spanMin, asleepMinutes: partial.asleepMin } : null;
  const night = group ? buildSleepNight(group.samples) : null;
  if (!night) return { detail: null, partial: partialInfo, ...latestFields };
  const from = new Date(night.startedAt);
  const to = new Date(night.endedAt);
  const [hr, resp] = await Promise.all([
    safe(h.queryStatistics({ type: T_HEART_RATE, unit: 'count/min', from, to, options: h.StatisticsOption.discreteAverage | h.StatisticsOption.discreteMin })),
    safe(h.queryStatistics({ type: T_RESPIRATORY, unit: 'count/min', from, to, options: h.StatisticsOption.discreteAverage | h.StatisticsOption.discreteMin })),
  ]);
  return {
    detail: {
      date: night.date,
      startedAt: night.startedAt,
      endedAt: night.endedAt,
      breakdown: night.breakdown,
      segments: night.segments,
      heartRate: { average: roundBpm(hr?.average), lowest: roundBpm(hr?.min) },
      respiratoryRate: { average: round1(resp?.average), lowest: round1(resp?.min) },
    },
    partial: partialInfo,
    ...latestFields,
  };
}

/** Detalhe da ultima noite completa (so o detalhe; ver fetchSleepScreenData). Sem noite completa = null. */
export async function fetchSleepSessionDetail(): Promise<SleepSessionDetail | null> {
  return (await fetchSleepScreenData()).detail;
}

/** Diagnostico (modo desenvolvedor): as sessoes de sono lidas na janela da tela, cada uma classificada como noite, soneca ou trecho parcial. */
export async function fetchSleepSessionsDebug(): Promise<SleepSessionInfo[]> {
  const h = hk();
  if (!h || !h.isAvailable()) return [];
  const samples = await safe(readSleepSamples(new Date(Date.now() - SLEEP_SCREEN_LOOKBACK_HOURS * 60 * 60 * 1000)));
  return samples ? describeSleepSessions(samples) : [];
}

/** Rotulo informativo da fonte do sono mais recente ("Garmin Connect", "Apple Watch"...); null se nao ha. Nada depende disso. */
export async function fetchSleepSourceLabel(): Promise<string | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const samples = await safe(readSleepSamples(new Date(Date.now() - SLEEP_SCREEN_LOOKBACK_HOURS * 60 * 60 * 1000)));
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
  const [stepsToday, steps7d, distanceTodayMeters, distance7dMeters, activeEnergyTodayKcal, activeEnergy7dKcal, basalEnergyTodayKcal, basalEnergy7dKcal, heartRate, sleepLastNightHours] = await Promise.all([
    safe(sumSince(T_STEPS, 'count', today)),
    safe(sumSince(T_STEPS, 'count', sevenDaysAgo)),
    safe(sumSince(T_DISTANCE, 'm', today)),
    safe(sumSince(T_DISTANCE, 'm', sevenDaysAgo)),
    safe(sumSince(T_ENERGY, 'kcal', today)),
    safe(sumSince(T_ENERGY, 'kcal', sevenDaysAgo)),
    safe(sumSince(T_BASAL, 'kcal', today)),
    safe(sumSince(T_BASAL, 'kcal', sevenDaysAgo)),
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
    basalEnergyTodayKcal,
    basalEnergy7dKcal,
    heartRate: heartRate ?? emptyHealthSummary().heartRate,
    sleepLastNightHours,
  };
}

// ----------------------------------------------------------------------------------------------------------------- historico por periodo
/** Sono por dia (7D/4 SEM), cada noite no dia em que a pessoa ACORDOU. Le 1 dia a mais em cada ponta para nao cortar uma noite que cruza a janela. */
async function sleepHistoryByKey(start: Date, end: Date): Promise<Map<string, number>> {
  const samples = await safe(readSleepSamples(addDays(start, -1), addDays(end, 1)));
  return samples ? sleepHoursByWakeDay(samples, 'day') : new Map();
}

export async function fetchHealthMetricHistory(metric: HealthMetricKey, period: HealthHistoryPeriod, offset = 0): Promise<HealthMetricHistory> {
  const { start, end, granularity } = resolveHistoryWindow(period, offset);
  const h = hk();
  const keyOf = granularity === 'day' ? toDateKey : toMonthKey;
  if (!h || !h.isAvailable()) return buildHistory(period, offset, new Map());
  const interval = granularity === 'day' ? { day: 1 } : { month: 1 };
  if (metric === 'calories') {
    const [activeBuckets, basalBuckets] = await Promise.all([
      safe(statsBuckets(T_ENERGY, 'kcal', start, endOfDay(end), h.StatisticsOption.cumulativeSum, interval)),
      safe(statsBuckets(T_BASAL, 'kcal', start, endOfDay(end), h.StatisticsOption.cumulativeSum, interval)),
    ]);
    return buildCaloriesHistory(
      period,
      offset,
      activeBuckets ? bucketMap(activeBuckets, 'sum', keyOf) : new Map(),
      basalBuckets ? bucketMap(basalBuckets, 'sum', keyOf) : new Map()
    );
  }
  let byKey = new Map<string, number>();
  if (metric === 'sleep') {
    // A tela de Sono nao tem 1 ANO (granularidade mensal): so 1D/7D/4 SEM chegam aqui. Se um dia chegar, volta vazio em vez de misturar chaves.
    byKey = granularity === 'day' ? await sleepHistoryByKey(start, end) : new Map();
  } else {
    const spec =
      metric === 'steps'
        ? { type: T_STEPS, unit: 'count', option: h.StatisticsOption.cumulativeSum, field: 'sum' as const }
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

// ------------------------------------------------------------------------------------------------------- Vitalidade dinamica (hoje e historico)
// So LEITURA do Apple Saude; nada sai do aparelho. Cada leitura falha sozinha (fica null/0) e nunca derruba a Vitalidade. A logica de calculo e pura (vitalityDynamic.ts).
const HOUR_MS = 60 * 60 * 1000;
/** Lacunas de FC menores que isto nao valem uma consulta (poucos minutos entre dois treinos). */
const MIN_HR_GAP_MS = 15 * 60 * 1000;

interface WorkoutWindow {
  workout: WorkoutInput;
  start: Date;
  end: Date;
}

/** Treinos concluidos em [from, to] SEM rota (leve), cada um com os passos e a FC media DENTRO da janela do treino e a energia do proprio treino. */
async function readWorkoutWindows(from: Date, to: Date): Promise<WorkoutWindow[]> {
  const h = hk();
  if (!h || !h.isAvailable()) return [];
  // `from` do HealthKit filtra pelo INICIO do treino (strictStartDate): um treino que comecou antes de `from` e terminou depois (ex.: 23:40 a 00:30) ficaria de
  // fora. Volta 12 h e mantem so os que TERMINAM depois de `from`; abaixo, as consultas de passos/FC e os minutos sao recortados em max(inicio, from).
  const samples = await safe(h.queryWorkouts({ from: new Date(from.getTime() - 12 * HOUR_MS), ascending: true, limit: 0 }));
  if (!samples) return [];
  const inRange = samples.filter(
    (w) => w.endDate.getTime() <= to.getTime() && w.endDate.getTime() > from.getTime() && w.endDate.getTime() > w.startDate.getTime()
  );
  // O mesmo treino gravado duas vezes (relogio + copia de outro app) nao pode dobrar o desgaste: junta os que se sobrepoem a 80% ou mais e fica com o mais longo
  // (antes das consultas por treino, para nao gastar consulta com duplicata).
  const done = mergeOverlappingWorkouts(inRange, (w) => ({ start: Math.max(w.startDate.getTime(), from.getTime()), end: w.endDate.getTime() }));
  return Promise.all(
    done.map(async (w) => {
      const windowStart = new Date(Math.max(w.startDate.getTime(), from.getTime()));
      const clipped = windowStart.getTime() > w.startDate.getTime();
      const [stepStats, hrStats, energyStats] = await Promise.all([
        safe(h.queryStatistics({ type: T_STEPS, unit: 'count', from: windowStart, to: w.endDate, options: h.StatisticsOption.cumulativeSum })),
        safe(h.queryStatistics({ type: T_HEART_RATE, unit: 'count/min', from: windowStart, to: w.endDate, options: h.StatisticsOption.discreteAverage })),
        // Energia ativa (kcal, cumulativa) DENTRO da janela do treino: a fonte principal das calorias do treino (o totalEnergyBurned do HKWorkout e so o plano B).
        safe(h.queryStatistics({ type: T_ENERGY, unit: 'kcal', from: windowStart, to: w.endDate, options: h.StatisticsOption.cumulativeSum })),
      ]);
      const wallMinutes = (w.endDate.getTime() - windowStart.getTime()) / 60000;
      const reported = typeof w.duration === 'number' && Number.isFinite(w.duration) && w.duration > 0 ? w.duration / 60 : null;
      const minutes = clipped || reported == null ? wallMinutes : reported;
      return {
        start: windowStart,
        end: w.endDate,
        workout: {
          minutes,
          avgHr: roundBpm(hrStats?.average),
          steps: typeof stepStats?.sum === 'number' ? stepStats.sum : null,
          activeKcal: resolveWorkoutKcal(
            typeof energyStats?.sum === 'number' ? energyStats.sum : null,
            w.totalEnergyBurned,
            (w.endDate.getTime() - windowStart.getTime()) / Math.max(1, w.endDate.getTime() - w.startDate.getTime())
          ),
        },
      };
    })
  );
}

/** FC de repouso do Apple Saude (media dos ultimos 14 dias); sem o tipo ou sem dado = null (a intensidade dos treinos vira desconhecida, nao zero). */
export async function fetchRestingHeartRate(now: Date = new Date()): Promise<number | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const stats = await safe(h.queryStatistics({ type: T_RESTING_HR, unit: 'count/min', from: addDays(startOfDay(now), -14), to: now, options: h.StatisticsOption.discreteAverage }));
  return roundBpm(stats?.average);
}

/**
 * Dados de HOJE para a Vitalidade, ao vivo: passos e calorias ativas do dia, treinos de hoje (com os passos e calorias DENTRO da janela de cada treino, para
 * descontar do movimento), FC media acordado fora de treino acima da FC de repouso, horas de descanso (poucos passos e FC perto do repouso) e minutos de
 * soneca. `windowStart` = INICIO DO CICLO: a ancora (quando acordou; a janela pode atravessar a meia-noite) ou, sem ancora, 00:00 de hoje; tudo conta desde ai ate agora
 * (limitado a no maximo agora). Sem HealthKit = null.
 */
export async function fetchVitalityToday(now: Date, windowStart: Date): Promise<{ day: DayInput; restHr: number | null } | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const awakeFrom = windowStart.getTime() > now.getTime() ? now : windowStart;
  const [steps, activeKcal, windows, restHr, sleepSamples] = await Promise.all([
    safe(sumSince(T_STEPS, 'count', awakeFrom)),
    safe(sumSince(T_ENERGY, 'kcal', awakeFrom)),
    readWorkoutWindows(awakeFrom, now),
    fetchRestingHeartRate(now),
    safe(readSleepSamples(awakeFrom)),
  ]);

  // FC media acordado FORA de treino: media (ponderada pela duracao) das lacunas entre os treinos, dentro de [awakeFrom, agora].
  const gaps: [number, number][] = [];
  let cursor = awakeFrom.getTime();
  for (const w of windows.slice().sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (w.start.getTime() > cursor) gaps.push([cursor, Math.min(w.start.getTime(), now.getTime())]);
    cursor = Math.max(cursor, w.end.getTime());
  }
  if (cursor < now.getTime()) gaps.push([cursor, now.getTime()]);
  let weighted = 0;
  let weight = 0;
  await Promise.all(
    gaps
      .filter(([a, b]) => b - a >= MIN_HR_GAP_MS)
      .map(async ([a, b]) => {
        const stats = await safe(h.queryStatistics({ type: T_HEART_RATE, unit: 'count/min', from: new Date(a), to: new Date(b), options: h.StatisticsOption.discreteAverage }));
        if (typeof stats?.average === 'number' && Number.isFinite(stats.average)) {
          weighted += stats.average * (b - a);
          weight += b - a;
        }
      })
  );
  const awakeAvgHr = weight > 0 ? weighted / weight : null;
  const awakeHrElevation = awakeAvgHr != null && restHr != null ? Math.max(0, awakeAvgHr - restHr) : null;

  // Horas de descanso: horas inteiras acordado, sem treino, com menos de 150 passos e FC media ate 10 bpm acima do repouso (sem FC, so os passos).
  const firstHour = Math.ceil(awakeFrom.getTime() / HOUR_MS) * HOUR_MS;
  const lastHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  let restHours = 0;
  if (lastHour > firstHour) {
    const [stepBuckets, hrBuckets] = await Promise.all([
      safe(statsBuckets(T_STEPS, 'count', new Date(firstHour), new Date(lastHour), h.StatisticsOption.cumulativeSum, { minute: 60 })),
      safe(statsBuckets(T_HEART_RATE, 'count/min', new Date(firstHour), new Date(lastHour), h.StatisticsOption.discreteAverage, { minute: 60 })),
    ]);
    const stepsByHour = new Map<number, number>();
    for (const b of stepBuckets ?? []) if (typeof b.sum === 'number') stepsByHour.set(Math.round(b.startDate.getTime() / HOUR_MS), b.sum);
    const hrByHour = new Map<number, number>();
    for (const b of hrBuckets ?? []) if (typeof b.average === 'number') hrByHour.set(Math.round(b.startDate.getTime() / HOUR_MS), b.average);
    for (let t = firstHour; t < lastHour; t += HOUR_MS) {
      if (windows.some((w) => w.start.getTime() < t + HOUR_MS && w.end.getTime() > t)) continue;
      const key = Math.round(t / HOUR_MS);
      const hourSteps = stepsByHour.get(key) ?? 0;
      const hourHr = hrByHour.get(key);
      if (hourSteps < 150 && (hourHr == null || restHr == null || hourHr <= restHr + 10)) restHours += 1;
    }
  }

  return {
    restHr,
    day: {
      steps,
      activeKcal,
      workouts: windows.map((w) => w.workout),
      awakeHrElevation,
      restHours,
      napMinutes: sleepSamples ? napMinutesSince(sleepSamples, awakeFrom.getTime(), now) : 0,
    },
  };
}

/** Ultimos `days` dias (sem hoje) para a referencia pessoal: passos e calorias ativas por dia e os treinos de cada dia. Sem HealthKit ou sem nenhum dado = null. */
export async function fetchVitalityHistory(now: Date = new Date(), days = 14): Promise<HistoryDay[] | null> {
  const h = hk();
  if (!h || !h.isAvailable()) return null;
  const end = startOfDay(now);
  const start = addDays(end, -days);
  const [stepBuckets, kcalBuckets, windows] = await Promise.all([
    safe(statsBuckets(T_STEPS, 'count', start, end, h.StatisticsOption.cumulativeSum, { day: 1 })),
    safe(statsBuckets(T_ENERGY, 'kcal', start, end, h.StatisticsOption.cumulativeSum, { day: 1 })),
    readWorkoutWindows(start, end),
  ]);
  if (stepBuckets == null && kcalBuckets == null) return null;
  const stepsByDay = bucketMap(stepBuckets ?? [], 'sum', toDateKey);
  const kcalByDay = bucketMap(kcalBuckets ?? [], 'sum', toDateKey);
  const out: HistoryDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const key = toDateKey(addDays(start, i));
    out.push({
      steps: stepsByDay.get(key) ?? null,
      activeKcal: kcalByDay.get(key) ?? null,
      workouts: windows.filter((w) => toDateKey(w.start) === key).map((w) => w.workout),
    });
  }
  return out;
}
