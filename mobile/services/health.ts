/**
 * Fachada publica do hub de saude do app — os componentes/telas devem
 * importar daqui, nunca diretamente de healthkit.ts (ou de uma futura
 * healthConnect.ts). Nesta etapa so existe a implementacao iOS (HealthKit);
 * cada funcao apenas delega pra ela, sem nenhum Platform.OS ainda. Quando o
 * suporte a Health Connect (Android) for implementado, e aqui — e so aqui —
 * que a decisao por plataforma entra, sem exigir mudanca nos consumidores.
 *
 * 3 funcoes que tinham "HealthKit" no nome foram expostas aqui com nome
 * generico (a implementacao em healthkit.ts continua com o nome original,
 * isso e so um alias de export): isHealthKitAvailable -> isHealthAvailable,
 * requestHealthKitPermissions -> requestHealthPermissions,
 * ensureHealthKitAuthorized -> ensureHealthAuthorized. As demais funcoes ja
 * tinham nome agnostico de plataforma e mantem o mesmo nome.
 */
export {
  HEALTHKIT_CONNECTED_KEY,
  isHealthKitAvailable as isHealthAvailable,
  requestHealthKitPermissions as requestHealthPermissions,
  ensureHealthKitAuthorized as ensureHealthAuthorized,
  fetchRecentWorkouts,
  fetchHeartRateSamplesSince,
  fetchRecentHeartRateBpm,
  fetchLastNightSleepHours,
  fetchSleepSessionDetail,
  fetchAverageHeartRate,
  fetchStepsLast7Days,
  fetchActiveEnergyLast7Days,
  fetchHealthMetricHistory,
  fetchDayHeartRateDetail,
  fetchWeekHeartRateDetail,
  fetchHealthSummary,
} from './healthkit';

export type {
  HealthKitWorkout,
  HealthSummary,
  HeartRateSamplePoint,
  SleepStage,
  SleepStageSegment,
  SleepStageBreakdown,
  SleepSessionDetail,
  DailyQuantityPoint,
  HealthHistoryPeriod,
  HealthHistoryGranularity,
  HealthMetricKey,
  HealthHistoryPoint,
  HealthMetricHistory,
  HeartRateIntradayPoint,
  DayHeartRateDetail,
  WeekHeartRateDayPoint,
  WeekHeartRateDetail,
} from './health.types';
