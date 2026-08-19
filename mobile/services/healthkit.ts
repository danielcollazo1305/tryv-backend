import {
  CategoryValueSleepAnalysis,
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import type { Quantity, QuantityTypeIdentifier, UnitForIdentifier, WorkoutProxyTyped } from '@kingstinct/react-native-healthkit';

import { ActivityType, RoutePoint } from '@/services/activities';

export interface HealthKitWorkout {
  id: string;
  activityType: ActivityType;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  distanceMeters: number | null;
  caloriesBurned: number | null;
  /** Presente so quando o treino tem uma rota de GPS (HKWorkoutRoute) associada. */
  routePoints: RoutePoint[] | null;
}

/** So os tipos que o app ja usa (run/bike/swim/fight/hiit/other) — o resto cai em 'other'. */
const WORKOUT_TYPE_MAP: Partial<Record<WorkoutActivityType, ActivityType>> = {
  [WorkoutActivityType.running]: 'run',
  [WorkoutActivityType.cycling]: 'bike',
  [WorkoutActivityType.handCycling]: 'bike',
  [WorkoutActivityType.swimming]: 'swim',
  [WorkoutActivityType.boxing]: 'fight',
  [WorkoutActivityType.kickboxing]: 'fight',
  [WorkoutActivityType.martialArts]: 'fight',
  [WorkoutActivityType.wrestling]: 'fight',
  [WorkoutActivityType.highIntensityIntervalTraining]: 'hiit',
};

function mapActivityType(hkType: WorkoutActivityType): ActivityType {
  return WORKOUT_TYPE_MAP[hkType] ?? 'other';
}

/** As quantidades do HealthKit vem com a unidade junto — convertemos com base nela em vez de assumir uma fixa. */
function quantityToSeconds(q: Quantity): number {
  if (q.unit === 'min') return q.quantity * 60;
  if (q.unit === 'hr') return q.quantity * 3600;
  return q.quantity;
}

function quantityToMeters(q: Quantity): number {
  if (q.unit === 'km') return q.quantity * 1000;
  if (q.unit === 'mi') return q.quantity * 1609.344;
  return q.quantity;
}

export async function isHealthKitAvailable(): Promise<boolean> {
  return isHealthDataAvailable();
}

/**
 * Solicita autorizacao de leitura para tudo que o hub de saude do Tryv usa. O
 * HealthKit mostra um unico dialogo com todos os tipos de uma vez (o usuario
 * escolhe o que autorizar ali), entao nao ha ganho em pedir incrementalmente
 * por secao — so multiplicaria os dialogos para os mesmos dados.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  return requestAuthorization({
    toRead: [
      'HKWorkoutTypeIdentifier',
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKCategoryTypeIdentifierSleepAnalysis',
    ],
  });
}

async function extractRoutePoints(workout: WorkoutProxyTyped): Promise<RoutePoint[] | null> {
  try {
    const routes = await workout.getWorkoutRoutes();
    const locations = routes[0]?.locations;
    if (!locations || locations.length === 0) return null;
    return locations.map((location) => ({
      lat: location.latitude,
      lng: location.longitude,
      timestamp: location.date.toISOString(),
      alt: location.altitude,
    }));
  } catch {
    return null;
  }
}

/** Busca treinos do HealthKit desde a data informada, mais recentes primeiro. */
export async function fetchRecentWorkouts(sinceDate: Date): Promise<HealthKitWorkout[]> {
  const workouts = await queryWorkoutSamples({
    filter: { date: { startDate: sinceDate } },
    limit: 0,
    ascending: false,
  });

  const results: HealthKitWorkout[] = [];
  for (const workout of workouts) {
    results.push({
      id: workout.uuid,
      activityType: mapActivityType(workout.workoutActivityType),
      startedAt: workout.startDate.toISOString(),
      finishedAt: workout.endDate.toISOString(),
      durationSeconds: Math.round(quantityToSeconds(workout.duration)),
      distanceMeters: workout.totalDistance ? quantityToMeters(workout.totalDistance) : null,
      caloriesBurned: workout.totalEnergyBurned ? workout.totalEnergyBurned.quantity : null,
      routePoints: await extractRoutePoints(workout),
    });
  }
  return results;
}

export interface HealthSummary {
  stepsToday: number | null;
  steps7d: number | null;
  distanceTodayMeters: number | null;
  distance7dMeters: number | null;
  activeEnergyTodayKcal: number | null;
  activeEnergy7dKcal: number | null;
  heartRate: {
    mostRecentBpm: number | null;
    mostRecentAt: string | null;
    average7dBpm: number | null;
  };
  /** Soma dos intervalos "dormindo" (exclui "na cama" e "acordado") nas ultimas ~32h. */
  sleepLastNightHours: number | null;
}

function startOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Soma cumulativa de uma quantidade (passos, distancia, calorias) desde a data informada. */
async function sumQuantity<T extends QuantityTypeIdentifier>(
  identifier: T,
  unit: UnitForIdentifier<T>,
  since: Date
): Promise<number | null> {
  const stats = await queryStatisticsForQuantity(identifier, ['cumulativeSum'], {
    filter: { date: { startDate: since } },
    unit,
  });
  return stats.sumQuantity ? stats.sumQuantity.quantity : null;
}

async function fetchHeartRateSummary(since: Date): Promise<HealthSummary['heartRate']> {
  const [mostRecent, stats] = await Promise.all([
    getMostRecentQuantitySample('HKQuantityTypeIdentifierHeartRate', 'count/min'),
    queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage'], {
      filter: { date: { startDate: since } },
      unit: 'count/min',
    }),
  ]);
  return {
    mostRecentBpm: mostRecent ? Math.round(mostRecent.quantity) : null,
    mostRecentAt: mostRecent ? mostRecent.endDate.toISOString() : null,
    average7dBpm: stats.averageQuantity ? Math.round(stats.averageQuantity.quantity) : null,
  };
}

export interface HeartRateSamplePoint {
  bpm: number;
  recordedAt: string;
}

/**
 * Amostras BRUTAS de FC (nao agregadas) desde a data informada, ordenadas da
 * mais antiga pra mais nova — usadas pra sincronizar com o backend
 * (POST /heart-rate/sync). Diferente de fetchHeartRateSummary (que so
 * resume "ultima leitura" + "media"), aqui precisamos de cada amostra
 * individual com seu proprio horario.
 */
export async function fetchHeartRateSamplesSince(sinceDate: Date): Promise<HeartRateSamplePoint[]> {
  const samples = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
    filter: { date: { startDate: sinceDate } },
    limit: 500,
    ascending: true,
    unit: 'count/min',
  });
  return samples.map((sample) => ({
    bpm: Math.round(sample.quantity),
    recordedAt: sample.endDate.toISOString(),
  }));
}

/**
 * Leitura mais recente de FC, so retornada se tiver no maximo maxAgeMs de
 * idade — usada durante uma atividade ao vivo, onde mostrar uma leitura de
 * horas atras como se fosse "agora" seria enganoso pro professor
 * acompanhando. Sem Apple Watch (ou outro dispositivo companion gravando
 * ativamente), isso praticamente sempre retorna null durante o treino — o
 * iPhone sozinho nao tem sensor de FC nem fonte alternativa via HealthKit.
 */
export async function fetchRecentHeartRateBpm(maxAgeMs: number): Promise<number | null> {
  const sample = await getMostRecentQuantitySample('HKQuantityTypeIdentifierHeartRate', 'count/min');
  if (!sample) return null;
  if (Date.now() - sample.endDate.getTime() > maxAgeMs) return null;
  return Math.round(sample.quantity);
}

// "Dormindo" cobre os 3 estagios especificos (core/deep/REM) e o generico
// "asleepUnspecified" (usado por relogios/apps que nao diferenciam estagio) —
// exclui "na cama" (inBed) e "acordado" (awake) de proposito.
const ASLEEP_VALUES = new Set<CategoryValueSleepAnalysis>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

/** Exportada tambem isoladamente (alem de compor fetchHealthSummary) para o Score de Prontidao, que so precisa do sono. */
export async function fetchLastNightSleepHours(): Promise<number | null> {
  const since = daysAgo(32 / 24);
  const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
    filter: { date: { startDate: since } },
    limit: 0,
    ascending: false,
  });
  if (samples.length === 0) return null;

  const totalMs = samples
    .filter((sample) => ASLEEP_VALUES.has(sample.value as CategoryValueSleepAnalysis))
    .reduce((sum, sample) => sum + (sample.endDate.getTime() - sample.startDate.getTime()), 0);
  return totalMs > 0 ? totalMs / (1000 * 60 * 60) : null;
}

/** Roda uma busca e engole falha (transiente ou de tipo nao autorizado) virando null, sem derrubar o resto do resumo. */
async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

const EMPTY_HEART_RATE: HealthSummary['heartRate'] = {
  mostRecentBpm: null,
  mostRecentAt: null,
  average7dBpm: null,
};

export interface DailyQuantityPoint {
  /** 'YYYY-MM-DD' em horario local. */
  date: string;
  /** null = sem dado nesse dia (HealthKit nao distingue "zero" de "sem amostra" na resposta agregada). */
  value: number | null;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Quebra diaria (7 dias, hoje incluso) de uma quantidade cumulativa, usada
 * pelo grafico de barras do card de Apple Health. Diferente de sumQuantity
 * (que so soma o periodo inteiro), aqui usamos
 * queryStatisticsCollectionForQuantity com intervalComponents={day:1} — a
 * mesma consulta nativa ja devolve um bucket por dia de uma vez, em vez de
 * precisar de 7 chamadas separadas (uma por dia).
 */
async function fetchDailyQuantityLast7Days<T extends QuantityTypeIdentifier>(
  identifier: T,
  unit: UnitForIdentifier<T>
): Promise<DailyQuantityPoint[]> {
  const start = startOfToday();
  start.setDate(start.getDate() - 6);
  const end = new Date();

  const buckets = await queryStatisticsCollectionForQuantity(identifier, ['cumulativeSum'], start, { day: 1 }, {
    filter: { date: { startDate: start, endDate: end } },
    unit,
  });

  const byDate = new Map<string, number>();
  for (const bucket of buckets) {
    if (!bucket.startDate || !bucket.sumQuantity) continue;
    byDate.set(toDateKey(bucket.startDate), bucket.sumQuantity.quantity);
  }

  const points: DailyQuantityPoint[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    const key = toDateKey(day);
    points.push({ date: key, value: byDate.has(key) ? byDate.get(key)! : null });
  }
  return points;
}

/** Passos dia a dia dos ultimos 7 dias (hoje incluso), pro grafico de barras expandido do card de Apple Health. */
export async function fetchStepsLast7Days(): Promise<DailyQuantityPoint[]> {
  return fetchDailyQuantityLast7Days('HKQuantityTypeIdentifierStepCount', 'count');
}

/** Calorias ativas dia a dia dos ultimos 7 dias — mesmo uso do fetchStepsLast7Days, so mudando o tipo de quantidade. */
export async function fetchActiveEnergyLast7Days(): Promise<DailyQuantityPoint[]> {
  return fetchDailyQuantityLast7Days('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal');
}

/**
 * Busca um resumo do que estiver disponivel no Apple Health, sem se importar
 * com qual app escreveu o dado (relogio nativo, Zepp, Strava, etc. — o
 * HealthKit nao diferencia a origem na leitura). Cada metrica e buscada com
 * "safe" e falha de forma independente (fica null) em vez de derrubar o
 * resumo inteiro — uma unica consulta instavel (ex: logo apos autorizar,
 * quando um tipo recem-liberado ainda pode nao estar "pronto") nao pode
 * fazer o card inteiro parecer "nunca conectado".
 */
// ─────────────────────────────────────────────────────────────────────────
// Historico por periodo (1d/7d/4w/1y), usado pela tela de detalhe de cada
// metrica (app/health/[metric].tsx) — mesma janela/offset de navegacao
// "< >" ja usada em GET /meals/summary (services/meals.ts,
// MealsHistoryCard), so que resolvida aqui no cliente porque a fonte e o
// HealthKit local, nao o backend. A logica de janela (1d/7d/4w diarios, 1y
// em 12 meses civis) espelha _resolve_summary_window de app/routers/meals.py
// de proposito, pra manter os dois historicos do app com o mesmo
// comportamento de navegacao.
export type HealthHistoryPeriod = '1d' | '7d' | '4w' | '1y';
export type HealthHistoryGranularity = 'day' | 'month';
export type HealthMetricKey = 'heartRate' | 'steps' | 'sleep' | 'calories';

export interface HealthHistoryPoint {
  /** 'YYYY-MM-DD' (granularity='day') ou 'YYYY-MM' (granularity='month'), sempre local. */
  date: string;
  value: number | null;
}

export interface HealthMetricHistory {
  period: HealthHistoryPeriod;
  granularity: HealthHistoryGranularity;
  offset: number;
  startDate: string;
  endDate: string;
  points: HealthHistoryPoint[];
  /** Media so sobre os pontos com dado (null nao entra), igual a avg_calories etc. de MealsSummary. */
  average: number | null;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function endOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(23, 59, 59, 999);
  return result;
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Resolve a janela [start, end] + granularidade pro periodo/offset pedido — mesma semantica de _resolve_summary_window (meals.py). */
function resolveHistoryWindow(
  period: HealthHistoryPeriod,
  offset: number
): { start: Date; end: Date; granularity: HealthHistoryGranularity } {
  const today = startOfToday();

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

  // 1y — 12 meses civis terminando no mes atual (ou 12*offset meses atras).
  // getMonth() ja e 0-indexado, entao a conta de ordinal fica mais simples
  // que a versao em Python (que precisa compensar mes 1-indexado).
  const endOrdinal = today.getFullYear() * 12 + today.getMonth() - offset * 12;
  const startOrdinal = endOrdinal - 11;
  const start = new Date(Math.floor(startOrdinal / 12), ((startOrdinal % 12) + 12) % 12, 1);
  const end = new Date(Math.floor(endOrdinal / 12), ((endOrdinal % 12) + 12) % 12 + 1, 0);
  return { start, end, granularity: 'month' };
}

function buildBucketKeys(start: Date, end: Date, granularity: HealthHistoryGranularity): string[] {
  const keys: string[] = [];
  if (granularity === 'day') {
    let cursor = new Date(start);
    while (cursor <= end) {
      keys.push(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return keys;
  }
  let year = start.getFullYear();
  let month = start.getMonth();
  const endOrdinal = end.getFullYear() * 12 + end.getMonth();
  while (year * 12 + month <= endOrdinal) {
    keys.push(toMonthKey(new Date(year, month, 1)));
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return keys;
}

/** Soma (steps/calorias) ou media (FC) por bucket diario/mensal, via queryStatisticsCollectionForQuantity. */
async function fetchQuantityHistoryBuckets<T extends QuantityTypeIdentifier>(
  identifier: T,
  unit: UnitForIdentifier<T>,
  statistic: 'cumulativeSum' | 'discreteAverage',
  start: Date,
  end: Date,
  granularity: HealthHistoryGranularity
): Promise<Map<string, number>> {
  const buckets = await queryStatisticsCollectionForQuantity(
    identifier,
    [statistic],
    start,
    granularity === 'day' ? { day: 1 } : { month: 1 },
    { filter: { date: { startDate: start, endDate: endOfDay(end) } }, unit }
  );

  const byKey = new Map<string, number>();
  for (const bucket of buckets) {
    if (!bucket.startDate) continue;
    const quantity = statistic === 'cumulativeSum' ? bucket.sumQuantity : bucket.averageQuantity;
    if (!quantity) continue;
    const key = granularity === 'day' ? toDateKey(bucket.startDate) : toMonthKey(bucket.startDate);
    byKey.set(key, quantity.quantity);
  }
  return byKey;
}

/**
 * Sono por bucket diario/mensal — nao existe statistics collection pra tipo
 * categoria (so pra quantidade), entao busca as amostras brutas cobrindo a
 * janela (com 1 dia de folga de cada lado, pra pegar sessoes que cruzam
 * meia-noite) e soma manualmente. Atribuida ao dia em que a pessoa ACORDOU
 * (endDate da amostra), igual ao proprio app Apple Saude mostra a "noite
 * de sono" na data da manha seguinte, nao a da noite anterior.
 */
async function fetchSleepHistoryBuckets(
  start: Date,
  end: Date,
  granularity: HealthHistoryGranularity
): Promise<Map<string, number>> {
  const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
    filter: { date: { startDate: addDays(start, -1), endDate: addDays(end, 1) } },
    limit: 0,
    ascending: true,
  });

  const byKey = new Map<string, number>();
  for (const sample of samples) {
    if (!ASLEEP_VALUES.has(sample.value as CategoryValueSleepAnalysis)) continue;
    const key = granularity === 'day' ? toDateKey(sample.endDate) : toMonthKey(sample.endDate);
    const hours = (sample.endDate.getTime() - sample.startDate.getTime()) / (1000 * 60 * 60);
    byKey.set(key, (byKey.get(key) ?? 0) + hours);
  }
  return byKey;
}

async function buildHistory(
  period: HealthHistoryPeriod,
  offset: number,
  fetchBuckets: (start: Date, end: Date, granularity: HealthHistoryGranularity) => Promise<Map<string, number>>
): Promise<HealthMetricHistory> {
  const { start, end, granularity } = resolveHistoryWindow(period, offset);
  const byKey = await fetchBuckets(start, end, granularity);
  const keys = buildBucketKeys(start, end, granularity);
  const points: HealthHistoryPoint[] = keys.map((key) => ({ date: key, value: byKey.has(key) ? byKey.get(key)! : null }));

  const withData = points.filter((p): p is HealthHistoryPoint & { value: number } => p.value != null);
  const average = withData.length ? withData.reduce((sum, p) => sum + p.value, 0) / withData.length : null;

  return {
    period,
    granularity,
    offset,
    startDate: toDateKey(start),
    endDate: toDateKey(end),
    points,
    average,
  };
}

/** Busca o historico de uma das 4 metricas do HealthMetricsGrid pro periodo/offset pedido. */
export async function fetchHealthMetricHistory(
  metric: HealthMetricKey,
  period: HealthHistoryPeriod,
  offset = 0
): Promise<HealthMetricHistory> {
  switch (metric) {
    case 'heartRate':
      return buildHistory(period, offset, (start, end, granularity) =>
        fetchQuantityHistoryBuckets(
          'HKQuantityTypeIdentifierHeartRate',
          'count/min',
          'discreteAverage',
          start,
          end,
          granularity
        )
      );
    case 'steps':
      return buildHistory(period, offset, (start, end, granularity) =>
        fetchQuantityHistoryBuckets('HKQuantityTypeIdentifierStepCount', 'count', 'cumulativeSum', start, end, granularity)
      );
    case 'calories':
      return buildHistory(period, offset, (start, end, granularity) =>
        fetchQuantityHistoryBuckets(
          'HKQuantityTypeIdentifierActiveEnergyBurned',
          'kcal',
          'cumulativeSum',
          start,
          end,
          granularity
        )
      );
    case 'sleep':
      return buildHistory(period, offset, fetchSleepHistoryBuckets);
  }
}

export async function fetchHealthSummary(): Promise<HealthSummary> {
  const today = startOfToday();
  const sevenDaysAgo = daysAgo(7);

  const [
    stepsToday,
    steps7d,
    distanceTodayMeters,
    distance7dMeters,
    activeEnergyTodayKcal,
    activeEnergy7dKcal,
    heartRate,
    sleepLastNightHours,
  ] = await Promise.all([
    safe(sumQuantity('HKQuantityTypeIdentifierStepCount', 'count', today)),
    safe(sumQuantity('HKQuantityTypeIdentifierStepCount', 'count', sevenDaysAgo)),
    safe(sumQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', today)),
    safe(sumQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', sevenDaysAgo)),
    safe(sumQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', today)),
    safe(sumQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', sevenDaysAgo)),
    safe(fetchHeartRateSummary(sevenDaysAgo)),
    safe(fetchLastNightSleepHours()),
  ]);

  return {
    stepsToday: stepsToday != null ? Math.round(stepsToday) : null,
    steps7d: steps7d != null ? Math.round(steps7d) : null,
    distanceTodayMeters,
    distance7dMeters,
    activeEnergyTodayKcal: activeEnergyTodayKcal != null ? Math.round(activeEnergyTodayKcal) : null,
    activeEnergy7dKcal: activeEnergy7dKcal != null ? Math.round(activeEnergy7dKcal) : null,
    heartRate: heartRate ?? EMPTY_HEART_RATE,
    sleepLastNightHours,
  };
}
