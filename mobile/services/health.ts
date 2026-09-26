/**
 * Fachada publica do hub de saude do app — os componentes/telas devem
 * importar daqui, nunca diretamente de healthkit.ts ou healthConnect.ts.
 *
 * A decisao por plataforma vive AQUI e so aqui: iOS -> healthkit.ts (Apple
 * HealthKit), Android -> healthConnect.ts (Health Connect). A partir das
 * Etapas 4-6, as duas plataformas tem implementacao pra tudo (Passos,
 * Calorias, FC, Sono, Treino/GPS) — a unica diferenca real e Distancia, que
 * fica sempre null no Android (exigiria READ_DISTANCE, nao pedido em nenhuma
 * etapa) e RespiratoryRate dentro do detalhe de sono, mesmo motivo
 * (READ_RESPIRATORY_RATE nao pedido). Ambas seguem a mesma disciplina do
 * resto do app: sem dado real = "--"/null, nunca um numero inventado.
 *
 * 3 funcoes que tinham "HealthKit" no nome sao expostas aqui com nome
 * generico: isHealthKitAvailable -> isHealthAvailable,
 * requestHealthKitPermissions -> requestHealthPermissions,
 * ensureHealthKitAuthorized -> ensureHealthAuthorized. As demais ja tinham
 * nome agnostico de plataforma.
 */
import { Platform } from 'react-native';

import * as healthConnect from './healthConnect';
import * as healthkit from './healthkit';
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

const isIOS = Platform.OS === 'ios';

/** Como o SO chama a fonte de dados de saude — usado na copy dos cards ("Conectar ...", titulo). */
export const HEALTH_SOURCE_LABEL = isIOS ? 'Apple Health' : 'Health Connect';

export { HEALTHKIT_CONNECTED_KEY } from './healthkit';

// ─────────────────────────────────────────────────────────────────────────
// Disponibilidade / permissao

export function isHealthAvailable(): Promise<boolean> {
  return isIOS ? healthkit.isHealthKitAvailable() : healthConnect.isHealthConnectAvailable();
}

export function requestHealthPermissions(): Promise<boolean> {
  return isIOS ? healthkit.requestHealthKitPermissions() : healthConnect.requestHealthConnectPermissions();
}

export function ensureHealthAuthorized(): Promise<boolean> {
  return isIOS ? healthkit.ensureHealthKitAuthorized() : healthConnect.ensureHealthConnectAuthorized();
}

/**
 * Como ensureHealthAuthorized, mas com a garantia de NUNCA abrir o dialogo de
 * permissao do sistema. E o que a importacao automatica usa: ela roda sozinha,
 * sem o usuario ter pedido nada naquele instante — fazer um dialogo de
 * permissao aparecer do nada seria hostil, e em segundo plano nem apareceria,
 * so falharia.
 *
 * iOS: ensureHealthKitAuthorized pode RE-PEDIR autorizacao (quando a flag
 * local diz que ja conectou antes), por isso aqui usamos a checagem crua.
 * Android: ensureHealthConnectAuthorized ja e so leitura de estado, nao pede
 * nada — da pra reaproveitar direto.
 */
export function isHealthAuthorizedWithoutPrompting(): Promise<boolean> {
  return isIOS ? healthkit.isHealthKitReallyAuthorized() : healthConnect.ensureHealthConnectAuthorized();
}

// ─────────────────────────────────────────────────────────────────────────
// Passos e Calorias ativas

export function fetchStepsLast7Days(): Promise<DailyQuantityPoint[]> {
  return isIOS ? healthkit.fetchStepsLast7Days() : healthConnect.fetchStepsLast7Days();
}

export function fetchActiveEnergyLast7Days(): Promise<DailyQuantityPoint[]> {
  return isIOS ? healthkit.fetchActiveEnergyLast7Days() : healthConnect.fetchActiveEnergyLast7Days();
}

export function fetchHealthSummary(): Promise<HealthSummary> {
  return isIOS ? healthkit.fetchHealthSummary() : healthConnect.fetchHealthSummary();
}

export function fetchHealthMetricHistory(
  metric: HealthMetricKey,
  period: HealthHistoryPeriod,
  offset = 0
): Promise<HealthMetricHistory> {
  return isIOS
    ? healthkit.fetchHealthMetricHistory(metric, period, offset)
    : healthConnect.fetchHealthMetricHistory(metric, period, offset);
}

// ─────────────────────────────────────────────────────────────────────────
// Frequencia cardiaca

export function fetchHeartRateSamplesSince(sinceDate: Date): Promise<HeartRateSamplePoint[]> {
  return isIOS ? healthkit.fetchHeartRateSamplesSince(sinceDate) : healthConnect.fetchHeartRateSamplesSince(sinceDate);
}

export function fetchRecentHeartRateBpm(maxAgeMs: number): Promise<number | null> {
  return isIOS ? healthkit.fetchRecentHeartRateBpm(maxAgeMs) : healthConnect.fetchRecentHeartRateBpm(maxAgeMs);
}

export function fetchAverageHeartRate(start: Date, end: Date): Promise<number | null> {
  return isIOS ? healthkit.fetchAverageHeartRate(start, end) : healthConnect.fetchAverageHeartRate(start, end);
}

export function fetchDayHeartRateDetail(dayOffset = 0): Promise<DayHeartRateDetail> {
  return isIOS ? healthkit.fetchDayHeartRateDetail(dayOffset) : healthConnect.fetchDayHeartRateDetail(dayOffset);
}

export function fetchWeekHeartRateDetail(weekOffset = 0): Promise<WeekHeartRateDetail> {
  return isIOS ? healthkit.fetchWeekHeartRateDetail(weekOffset) : healthConnect.fetchWeekHeartRateDetail(weekOffset);
}

// ─────────────────────────────────────────────────────────────────────────
// Sono

export function fetchLastNightSleepHours(): Promise<number | null> {
  return isIOS ? healthkit.fetchLastNightSleepHours() : healthConnect.fetchLastNightSleepHours();
}

export function fetchSleepSessionDetail(): Promise<SleepSessionDetail | null> {
  return isIOS ? healthkit.fetchSleepSessionDetail() : healthConnect.fetchSleepSessionDetail();
}

// ─────────────────────────────────────────────────────────────────────────
// Treino / GPS

export function fetchRecentWorkouts(sinceDate: Date): Promise<HealthKitWorkout[]> {
  return isIOS ? healthkit.fetchRecentWorkouts(sinceDate) : healthConnect.fetchRecentWorkouts(sinceDate);
}

/**
 * Leitura incremental pra importacao automatica (services/workoutAutoImport.ts).
 * No iOS usa a consulta ancorada do HealthKit (so o que mudou desde a ultima
 * execucao); no Android ainda cai na janela de `fallbackSince` e devolve
 * newAnchor null — ver o comentario na implementacao de healthConnect.ts.
 */
export function fetchWorkoutsSinceAnchor(
  anchor: string | null,
  fallbackSince: Date
): Promise<{ workouts: HealthKitWorkout[]; newAnchor: string | null }> {
  return isIOS
    ? healthkit.fetchWorkoutsSinceAnchor(anchor, fallbackSince)
    : healthConnect.fetchWorkoutsSinceAnchor(anchor, fallbackSince);
}

/**
 * Fase C (so iOS): registra a entrega em segundo plano do HealthKit pra
 * treinos e assina o callback que dispara quando o sistema entrega uma
 * atualizacao -- com o app aberto ou relancado em segundo plano pelo iOS
 * (ver comentario em healthkit.ts:setupBackgroundWorkoutDelivery pro
 * mecanismo completo). Android [Health Connect] nao tem gatilho de segundo
 * plano nesta fase (Fase D, bloqueada, fora de escopo) -- no-op que devolve
 * um unsubscribe vazio.
 *
 * Devolve uma funcao de limpeza; quem chama deve guarda-la e chamar no
 * cleanup do efeito que registrou isso.
 */
export function setupBackgroundWorkoutDelivery(onUpdate: () => void): Promise<() => void> {
  return isIOS ? healthkit.setupBackgroundWorkoutDelivery(onUpdate) : Promise.resolve(() => {});
}

/**
 * Abre a tela de ajustes da fonte de saude do SO. So faz algo no Android
 * (Health Connect) -- usado pra o usuario ligar "Rotas de exercicio"
 * manualmente, permissao que nao da pra pedir em runtime. No iOS e no-op
 * (o app de Saude nao tem deep link equivalente que valha a pena aqui).
 */
export function openHealthSettings(): void {
  if (!isIOS) healthConnect.openHealthConnectAppSettings();
}

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
