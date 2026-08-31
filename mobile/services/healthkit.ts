import {
  AuthorizationRequestStatus,
  CategoryValueSleepAnalysis,
  getMostRecentQuantitySample,
  getRequestStatusForAuthorization,
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
import * as SecureStore from 'expo-secure-store';

import { ActivityType, RoutePoint } from '@/services/activities';
import type {
  DailyQuantityPoint,
  DayHeartRateDetail,
  HealthHistoryGranularity,
  HealthHistoryPeriod,
  HealthHistoryPoint,
  HealthKitWorkout,
  HealthMetricHistory,
  HealthMetricKey,
  HealthSummary,
  HeartRateIntradayPoint,
  HeartRateSamplePoint,
  SleepSessionDetail,
  SleepStage,
  SleepStageBreakdown,
  SleepStageSegment,
  WeekHeartRateDayPoint,
  WeekHeartRateDetail,
} from './health.types';

// Movido de components/HealthSummaryCard.tsx pra ca (services/healthkit.ts
// re-exporta de la, ver comentario no arquivo original) — precisa estar
// aqui porque ensureHealthKitAuthorized (abaixo) tambem le essa flag, e um
// service nao deveria importar de um componente.
export const HEALTHKIT_CONNECTED_KEY = 'healthkit_connected';

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

// Lista unica de tipos de leitura — usada tanto por requestHealthKitPermissions
// (pede autorizacao) quanto por isHealthKitReallyAuthorized (checa se ja foi
// autorizado) — as 2 chamadas precisam da MESMA lista, senao a checagem
// poderia dizer "unnecessary" sem cobrir um tipo que o pedido de fato usa.
// RespiratoryRate adicionado nesta tarefa (detalhe de Sono, ver
// fetchSleepSessionDetail) — usuarios que ja conectaram antes disso vao
// ficar com esse tipo especifico em notDetermined ate o app re-pedir (ver
// ensureHealthKitAuthorized, que faz isso sozinho, sem exigir toque manual
// em "Conectar" de novo).
const HEALTHKIT_READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierRespiratoryRate',
  // Adicionado pro detalhe de Frequencia cardiaca (HeartRateDetailView) —
  // valor de "Descansando" calculado pelo proprio algoritmo da Apple
  // (periodos de baixa atividade + FC baixa ao longo do dia), mais preciso
  // que so pegar o minimo bruto das amostras do dia.
  'HKQuantityTypeIdentifierRestingHeartRate',
] as const;

/**
 * Solicita autorizacao de leitura para tudo que o hub de saude do Tryv usa. O
 * HealthKit mostra um unico dialogo com todos os tipos de uma vez (o usuario
 * escolhe o que autorizar ali), entao nao ha ganho em pedir incrementalmente
 * por secao — so multiplicaria os dialogos para os mesmos dados. Tipos ja
 * determinados (autorizados ou negados) antes NAO sao re-perguntados — so
 * tipos novos/nao determinados aparecem no dialogo.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  return requestAuthorization({ toRead: HEALTHKIT_READ_TYPES });
}

/**
 * Fonte de verdade REAL de autorizacao (nao a flag local
 * HEALTHKIT_CONNECTED_KEY, que so guarda "o usuario passou pelo fluxo uma
 * vez" e sobrevive a reinstalacoes via Keychain — ver investigacao do bug
 * "historico de Sono sempre dava erro"). `unnecessary` = todos os tipos de
 * HEALTHKIT_READ_TYPES ja foram determinados (autorizados ou negados)
 * pelo usuario NESTE binario — chamar requestAuthorization de novo nao
 * mostraria dialogo nenhum.
 */
export async function isHealthKitReallyAuthorized(): Promise<boolean> {
  const status = await getRequestStatusForAuthorization({ toRead: HEALTHKIT_READ_TYPES });
  return status === AuthorizationRequestStatus.unnecessary;
}

/**
 * Decide se pode seguir direto pra buscar dados. Ordem: (1) checa a
 * autorizacao REAL primeiro; (2) so se isso falhar E a flag local disser
 * "ja conectei antes", tenta re-pedir autorizacao sozinho (silencioso, sem
 * exigir o usuario tocar em "Conectar" de novo) — cobre exatamente o caso
 * de um tipo novo (ex: RespiratoryRate) ter sido adicionado depois que o
 * usuario ja tinha conectado; os tipos ja determinados antes nao sao
 * re-perguntados, entao isso nao reabre o dialogo inteiro à toa. So
 * devolve false (manda pra tela de "Conectar") quando realmente nunca
 * autorizou nada neste binario, ou quando o re-pedido falha/e negado.
 */
export async function ensureHealthKitAuthorized(): Promise<boolean> {
  if (await isHealthKitReallyAuthorized()) return true;

  const alreadyConnectedFlag = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
  if (!alreadyConnectedFlag) return false;

  const granted = await requestHealthKitPermissions();
  if (!granted) return false;
  return isHealthKitReallyAuthorized();
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

/**
 * Exportada tambem isoladamente (alem de compor fetchHealthSummary) para o
 * Score de Prontidao, que so precisa do sono.
 *
 * Reaproveita groupSamplesIntoSessions() (definida mais abaixo, hoisting de
 * function declaration cobre a chamada aqui em cima) e usa so a sessao mais
 * recente — mesma correcao ja aplicada em fetchSleepSessionDetail(). Antes
 * somava TODAS as amostras da janela de 32h sem agrupar por sessao, o
 * mesmo bug ja corrigido la, so que esta funcao tinha ficado de fora do
 * escopo daquela correcao — causa raiz confirmada do tile de Sono da Home
 * (e do Score de Prontidao) mostrando um total diferente da tela de
 * detalhe de Sono pra "a mesma" noite.
 */
export async function fetchLastNightSleepHours(): Promise<number | null> {
  const since = daysAgo(32 / 24);
  const allSamples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
    filter: { date: { startDate: since } },
    limit: 0,
    ascending: true,
  });
  if (allSamples.length === 0) return null;

  const sessions = groupSamplesIntoSessions(allSamples);
  const samples = sessions[sessions.length - 1];

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

// ─────────────────────────────────────────────────────────────────────────
// Detalhe da ultima noite de sono (estagios + timeline + FC/respiracao
// durante o sono), usado pela tela de detalhe de Sono (SleepDetailView.tsx)
// — MAIS detalhado que fetchLastNightSleepHours acima (que so soma um
// total), inspirado no nivel de detalhe do Garmin Connect (so a estrutura/
// dados, sem copiar o design — ver investigacao anterior).

function categorySampleToStage(value: CategoryValueSleepAnalysis): SleepStage | null {
  switch (value) {
    case CategoryValueSleepAnalysis.inBed:
      return 'inBed';
    case CategoryValueSleepAnalysis.awake:
      return 'awake';
    case CategoryValueSleepAnalysis.asleepCore:
    case CategoryValueSleepAnalysis.asleepUnspecified:
      return 'core';
    case CategoryValueSleepAnalysis.asleepDeep:
      return 'deep';
    case CategoryValueSleepAnalysis.asleepREM:
      return 'rem';
    default:
      return null;
  }
}

// Gap minimo (acordado, sem NENHUMA amostra de sono) pra considerar que
// uma sessao terminou e outra comecou — tolera uma pausa normal no meio da
// noite (banheiro, checar o celular) sem fragmentar a MESMA noite em 2
// sessoes, mas separa corretamente sessoes de fato distintas (uma soneca
// da tarde, ou a noite anterior, dentro das mesmas 32h de lookback).
const SLEEP_SESSION_GAP_MINUTES = 90;

/**
 * Agrupa amostras cronologicas (ascending) em sessoes distintas, cortando
 * sempre que o intervalo entre o fim de uma amostra (ou o maior fim ja
 * visto no grupo atual, pra tolerar amostras fora de ordem/sobrepostas) e
 * o inicio da proxima passar de SLEEP_SESSION_GAP_MINUTES. Sem isso,
 * fetchSleepSessionDetail somava TODAS as amostras da janela de 32h como
 * se fossem uma sessao so — bug confirmado (noite mostrando "31h na cama"
 * por juntar 2+ noites/sonecos).
 */
function groupSamplesIntoSessions<T extends { startDate: Date; endDate: Date }>(samples: T[]): T[][] {
  const sessions: T[][] = [];
  let current: T[] = [];
  let currentMaxEnd = 0;

  for (const sample of samples) {
    if (current.length === 0) {
      current = [sample];
      currentMaxEnd = sample.endDate.getTime();
      continue;
    }
    const gapMinutes = (sample.startDate.getTime() - currentMaxEnd) / (1000 * 60);
    if (gapMinutes > SLEEP_SESSION_GAP_MINUTES) {
      sessions.push(current);
      current = [sample];
      currentMaxEnd = sample.endDate.getTime();
    } else {
      current.push(sample);
      currentMaxEnd = Math.max(currentMaxEnd, sample.endDate.getTime());
    }
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

/**
 * Detalhe completo da ultima noite de sono. Busca candidatos nas ultimas
 * 32h (mesma janela de fetchLastNightSleepHours) mas agora AGRUPA os
 * candidatos por sessao (groupSamplesIntoSessions, gap de 90min) e usa SO
 * a sessao mais recente — as 32h sao so o alcance da busca, nao a
 * sessao em si (correcao do bug de noites/sonecas sendo somadas juntas).
 * Busca FC/respiracao dentro do intervalo real [1o segmento, ultimo
 * segmento] dessa sessao (nao um dia civil — queryStatisticsForQuantity
 * aceita qualquer Date como startDate/endDate do filtro).
 */
export async function fetchSleepSessionDetail(): Promise<SleepSessionDetail | null> {
  const since = daysAgo(32 / 24);
  const allSamples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
    filter: { date: { startDate: since } },
    limit: 0,
    ascending: true,
  });
  if (allSamples.length === 0) return null;

  const sessions = groupSamplesIntoSessions(allSamples);
  const samples = sessions[sessions.length - 1];

  const breakdown: SleepStageBreakdown = { deepMinutes: 0, lightMinutes: 0, remMinutes: 0, awakeMinutes: 0, totalAsleepMinutes: 0 };
  const segments: SleepStageSegment[] = [];

  for (const sample of samples) {
    const stage = categorySampleToStage(sample.value as CategoryValueSleepAnalysis);
    if (!stage) continue;

    segments.push({ stage, startDate: sample.startDate.toISOString(), endDate: sample.endDate.toISOString() });

    const minutes = (sample.endDate.getTime() - sample.startDate.getTime()) / (1000 * 60);
    if (stage === 'deep') breakdown.deepMinutes += minutes;
    else if (stage === 'core') breakdown.lightMinutes += minutes;
    else if (stage === 'rem') breakdown.remMinutes += minutes;
    else if (stage === 'awake') breakdown.awakeMinutes += minutes;
    // 'inBed' fica de fora dos minutos por estagio de proposito — quando a
    // fonte grava estagio real (Apple Watch) ela normalmente ja cobre o
    // periodo inteiro sem precisar de inBed separado; contar os 2 juntos
    // dobraria a duracao total nesses casos.
  }

  if (segments.length === 0) return null;
  breakdown.totalAsleepMinutes = breakdown.deepMinutes + breakdown.lightMinutes + breakdown.remMinutes;

  // Mesmo raciocinio do "inBed fica de fora dos minutos" acima, aplicado a
  // timeline: se a fonte gravou estagio real (deep/core/rem), os segmentos
  // 'inBed' normalmente SOBREPOEM o mesmo intervalo (nao sao adicionais) —
  // incluir os 2 na timeline (que empilha por ORDEM, nao por eixo de tempo
  // de verdade) contaria o mesmo periodo 2x, alongando a barra. Sem estagio
  // nenhum (so uma fonte manual tipo "Cama", sem relogio), inBed e a UNICA
  // informacao que existe — melhor mostrar do que deixar a timeline vazia.
  const hasStageData = breakdown.deepMinutes > 0 || breakdown.lightMinutes > 0 || breakdown.remMinutes > 0;
  const timelineSegments = hasStageData ? segments.filter((s) => s.stage !== 'inBed') : segments;

  const startedAt = segments.reduce((min, s) => (s.startDate < min ? s.startDate : min), segments[0].startDate);
  const endedAt = segments.reduce((max, s) => (s.endDate > max ? s.endDate : max), segments[0].endDate);
  const windowStart = new Date(startedAt);
  const windowEnd = new Date(endedAt);

  const [heartRateStats, respiratoryStats] = await Promise.all([
    safe(
      queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage', 'discreteMin'], {
        filter: { date: { startDate: windowStart, endDate: windowEnd } },
        unit: 'count/min',
      })
    ),
    safe(
      queryStatisticsForQuantity('HKQuantityTypeIdentifierRespiratoryRate', ['discreteAverage', 'discreteMin'], {
        filter: { date: { startDate: windowStart, endDate: windowEnd } },
        unit: 'count/min',
      })
    ),
  ]);

  return {
    date: toDateKey(windowEnd),
    startedAt,
    endedAt,
    breakdown,
    segments: timelineSegments,
    heartRate: {
      average: heartRateStats?.averageQuantity ? Math.round(heartRateStats.averageQuantity.quantity) : null,
      lowest: heartRateStats?.minimumQuantity ? Math.round(heartRateStats.minimumQuantity.quantity) : null,
    },
    respiratoryRate: {
      average: respiratoryStats?.averageQuantity ? Math.round(respiratoryStats.averageQuantity.quantity * 10) / 10 : null,
      lowest: respiratoryStats?.minimumQuantity ? Math.round(respiratoryStats.minimumQuantity.quantity * 10) / 10 : null,
    },
  };
}

/**
 * Media de FC (HeartRate) numa janela de tempo arbitraria — usada pelo
 * "bpm med." de cada atividade na tela de detalhe de FC (HeartRateDetailView),
 * mesma tecnica ja usada acima pra "FC durante o sono" (queryStatisticsForQuantity
 * com filtro de data), so exportada/generalizada pra qualquer janela.
 */
export async function fetchAverageHeartRate(start: Date, end: Date): Promise<number | null> {
  const stats = await safe(
    queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage'], {
      filter: { date: { startDate: start, endDate: end } },
      unit: 'count/min',
    })
  );
  return stats?.averageQuantity ? Math.round(stats.averageQuantity.quantity) : null;
}

const EMPTY_HEART_RATE: HealthSummary['heartRate'] = {
  mostRecentBpm: null,
  mostRecentAt: null,
  average7dBpm: null,
};

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

// ─────────────────────────────────────────────────────────────────────────
// Detalhe de Frequencia cardiaca (visao "1 dia" e "7 dias"), usado por
// HeartRateDetailView.tsx — bem mais detalhado que fetchHealthMetricHistory
// acima (que so agrega o dia/mes inteiro numa media, pro grid generico das
// 4 metricas). Inspirado no nivel de detalhe do Garmin Connect (so
// estrutura/dados, sem copiar o design — ver investigacao anterior).

async function fetchIntradayHeartRatePoints(dayStart: Date, dayEnd: Date): Promise<HeartRateIntradayPoint[]> {
  const buckets = await queryStatisticsCollectionForQuantity(
    'HKQuantityTypeIdentifierHeartRate',
    ['discreteAverage'],
    dayStart,
    { minute: 10 },
    { filter: { date: { startDate: dayStart, endDate: dayEnd } }, unit: 'count/min' }
  );

  const points: HeartRateIntradayPoint[] = [];
  for (const bucket of buckets) {
    if (!bucket.startDate || !bucket.averageQuantity) continue;
    points.push({ time: bucket.startDate.toISOString(), bpm: Math.round(bucket.averageQuantity.quantity) });
  }
  return points;
}

/** Detalhe de FC de 1 dia especifico (dayOffset=0 e hoje, 1 e ontem, etc). */
export async function fetchDayHeartRateDetail(dayOffset = 0): Promise<DayHeartRateDetail> {
  const day = addDays(startOfToday(), -dayOffset);
  const dayEnd = endOfDay(day);

  const [points, restingStats, peakStats] = await Promise.all([
    fetchIntradayHeartRatePoints(day, dayEnd),
    safe(
      queryStatisticsForQuantity('HKQuantityTypeIdentifierRestingHeartRate', ['discreteAverage'], {
        filter: { date: { startDate: day, endDate: dayEnd } },
        unit: 'count/min',
      })
    ),
    safe(
      queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteMax'], {
        filter: { date: { startDate: day, endDate: dayEnd } },
        unit: 'count/min',
      })
    ),
  ]);

  return {
    date: toDateKey(day),
    points,
    restingBpm: restingStats?.averageQuantity ? Math.round(restingStats.averageQuantity.quantity) : null,
    peakBpm: peakStats?.maximumQuantity ? Math.round(peakStats.maximumQuantity.quantity) : null,
  };
}

/** 1 estatistica por dia (nao amostra bruta da semana inteira — ver investigacao, ponto 4) via queryStatisticsCollectionForQuantity com bucket diario. */
async function fetchDailyQuantityStat<T extends QuantityTypeIdentifier>(
  identifier: T,
  unit: UnitForIdentifier<T>,
  statistic: 'discreteAverage' | 'discreteMax',
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const buckets = await queryStatisticsCollectionForQuantity(identifier, [statistic], start, { day: 1 }, {
    filter: { date: { startDate: start, endDate: endOfDay(end) } },
    unit,
  });

  const byKey = new Map<string, number>();
  for (const bucket of buckets) {
    if (!bucket.startDate) continue;
    const quantity = statistic === 'discreteMax' ? bucket.maximumQuantity : bucket.averageQuantity;
    if (!quantity) continue;
    byKey.set(toDateKey(bucket.startDate), quantity.quantity);
  }
  return byKey;
}

/** Detalhe de FC dos ultimos 7 dias (weekOffset=0), 1 min/max por dia — nao amostra crua da semana. */
export async function fetchWeekHeartRateDetail(weekOffset = 0): Promise<WeekHeartRateDetail> {
  const end = addDays(startOfToday(), -weekOffset * 7);
  const start = addDays(end, -6);

  const [restingByDay, peakByDay] = await Promise.all([
    fetchDailyQuantityStat('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', 'discreteAverage', start, end),
    fetchDailyQuantityStat('HKQuantityTypeIdentifierHeartRate', 'count/min', 'discreteMax', start, end),
  ]);

  const days: WeekHeartRateDayPoint[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    const key = toDateKey(day);
    days.push({
      date: key,
      restingBpm: restingByDay.has(key) ? Math.round(restingByDay.get(key)!) : null,
      peakBpm: peakByDay.has(key) ? Math.round(peakByDay.get(key)!) : null,
    });
  }

  const restingValues = days.map((d) => d.restingBpm).filter((v): v is number => v != null);
  const peakValues = days.map((d) => d.peakBpm).filter((v): v is number => v != null);

  return {
    days,
    avgRestingBpm: restingValues.length
      ? Math.round(restingValues.reduce((sum, v) => sum + v, 0) / restingValues.length)
      : null,
    avgPeakBpm: peakValues.length ? Math.round(peakValues.reduce((sum, v) => sum + v, 0) / peakValues.length) : null,
  };
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
