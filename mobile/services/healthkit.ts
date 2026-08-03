import {
  CategoryValueSleepAnalysis,
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryCategorySamples,
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

// "Dormindo" cobre os 3 estagios especificos (core/deep/REM) e o generico
// "asleepUnspecified" (usado por relogios/apps que nao diferenciam estagio) —
// exclui "na cama" (inBed) e "acordado" (awake) de proposito.
const ASLEEP_VALUES = new Set<CategoryValueSleepAnalysis>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

async function fetchLastNightSleepHours(): Promise<number | null> {
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

/**
 * Busca um resumo do que estiver disponivel no Apple Health, sem se importar
 * com qual app escreveu o dado (relogio nativo, Zepp, Strava, etc. — o
 * HealthKit nao diferencia a origem na leitura).
 */
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
    sumQuantity('HKQuantityTypeIdentifierStepCount', 'count', today),
    sumQuantity('HKQuantityTypeIdentifierStepCount', 'count', sevenDaysAgo),
    sumQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', today),
    sumQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', sevenDaysAgo),
    sumQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', today),
    sumQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', sevenDaysAgo),
    fetchHeartRateSummary(sevenDaysAgo),
    fetchLastNightSleepHours(),
  ]);

  return {
    stepsToday: stepsToday != null ? Math.round(stepsToday) : null,
    steps7d: steps7d != null ? Math.round(steps7d) : null,
    distanceTodayMeters,
    distance7dMeters,
    activeEnergyTodayKcal: activeEnergyTodayKcal != null ? Math.round(activeEnergyTodayKcal) : null,
    activeEnergy7dKcal: activeEnergy7dKcal != null ? Math.round(activeEnergy7dKcal) : null,
    heartRate,
    sleepLastNightHours,
  };
}
