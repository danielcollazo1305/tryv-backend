import {
  isHealthDataAvailable,
  requestAuthorization,
  queryWorkoutSamples,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import type { Quantity, WorkoutProxyTyped } from '@kingstinct/react-native-healthkit';

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

/** Solicita autorizacao de leitura para treinos e a frequencia cardiaca associada a eles. */
export async function requestHealthKitPermissions(): Promise<boolean> {
  return requestAuthorization({
    toRead: ['HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierHeartRate'],
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
