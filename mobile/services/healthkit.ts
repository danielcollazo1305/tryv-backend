/**
 * STUB TEMPORARIO — HealthKit desativado.
 *
 * A integracao real (@kingstinct/react-native-healthkit, via NitroModules)
 * foi removida porque o build iOS no EAS quebrava por um conflito entre o
 * NitroModules e o Expo (interop C++/Objective-C: "'functional' file not
 * found" ou, ao forcar o interop, colisao de `GenericTypedArray` no
 * ExpoModulesCore-Swift.h). Sem um fix viavel, a lib e os 2 plugins locais
 * (withHealthKitBackgroundDelivery, withExpoNitroInteropFix) sairam do projeto.
 *
 * Este arquivo mantem as MESMAS exports e assinaturas da implementacao antiga
 * pra services/health.ts (fachada) e toda a UI continuarem compilando sem
 * mudanca, mas nenhuma funcao fala com o Apple Health: tudo devolve
 * vazio/nulo/false. No iOS, os cards de saude ficam sem dados e o botao de
 * importar treinos nao encontra nada ate isso ser reativado.
 *
 * Reativar quando o conflito for resolvido ou quando trocarmos de lib. A
 * implementacao anterior esta no historico do git (services/healthkit.ts).
 */
import type {
  DailyQuantityPoint,
  DayHeartRateDetail,
  HealthHistoryPeriod,
  HealthKitWorkout,
  HealthMetricHistory,
  HealthMetricKey,
  HealthSummary,
  HeartRateSamplePoint,
  SleepSessionDetail,
  WeekHeartRateDetail,
} from './health.types';

export const HEALTHKIT_CONNECTED_KEY = 'healthkit_connected';

export async function isHealthKitAvailable(): Promise<boolean> {
  return false;
}

export async function requestHealthKitPermissions(): Promise<boolean> {
  return false;
}

export async function isHealthKitReallyAuthorized(): Promise<boolean> {
  return false;
}

export async function ensureHealthKitAuthorized(): Promise<boolean> {
  return false;
}

export async function fetchRecentWorkouts(_sinceDate: Date): Promise<HealthKitWorkout[]> {
  return [];
}

export async function fetchWorkoutsSinceAnchor(
  anchor: string | null,
  _fallbackSince: Date
): Promise<{ workouts: HealthKitWorkout[]; newAnchor: string | null }> {
  return { workouts: [], newAnchor: anchor };
}

export async function setupBackgroundWorkoutDelivery(_onUpdate: () => void): Promise<() => void> {
  return () => {};
}

export async function fetchHeartRateSamplesSince(_sinceDate: Date): Promise<HeartRateSamplePoint[]> {
  return [];
}

export async function fetchRecentHeartRateBpm(_maxAgeMs: number): Promise<number | null> {
  return null;
}

export async function fetchLastNightSleepHours(): Promise<number | null> {
  return null;
}

export async function fetchSleepSessionDetail(): Promise<SleepSessionDetail | null> {
  return null;
}

export async function fetchAverageHeartRate(_start: Date, _end: Date): Promise<number | null> {
  return null;
}

export async function fetchStepsLast7Days(): Promise<DailyQuantityPoint[]> {
  return [];
}

export async function fetchActiveEnergyLast7Days(): Promise<DailyQuantityPoint[]> {
  return [];
}

export async function fetchHealthMetricHistory(
  _metric: HealthMetricKey,
  period: HealthHistoryPeriod,
  offset = 0
): Promise<HealthMetricHistory> {
  const now = new Date().toISOString();
  return {
    period,
    granularity: period === '1y' ? 'month' : 'day',
    offset,
    startDate: now,
    endDate: now,
    points: [],
    average: null,
  };
}

export async function fetchDayHeartRateDetail(_dayOffset = 0): Promise<DayHeartRateDetail> {
  return { date: new Date().toISOString(), points: [], restingBpm: null, peakBpm: null };
}

export async function fetchWeekHeartRateDetail(_weekOffset = 0): Promise<WeekHeartRateDetail> {
  return { days: [], avgRestingBpm: null, avgPeakBpm: null };
}

export async function fetchHealthSummary(): Promise<HealthSummary> {
  return {
    stepsToday: null,
    steps7d: null,
    distanceTodayMeters: null,
    distance7dMeters: null,
    activeEnergyTodayKcal: null,
    activeEnergy7dKcal: null,
    heartRate: { mostRecentBpm: null, mostRecentAt: null, average7dBpm: null },
    sleepLastNightHours: null,
  };
}
