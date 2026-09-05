import {
  aggregateGroupByDuration,
  aggregateGroupByPeriod,
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  requestExerciseRoute,
  requestPermission,
  SdkAvailabilityStatus,
  SleepStageType,
} from 'react-native-health-connect';
import type { Permission, RecordResult } from 'react-native-health-connect';

// ExerciseRouteResultType e um enum de verdade em base.types.ts, mas esse
// arquivo nao e re-exportado pelo index publico do pacote (so records/
// results/aggregate/changes/metadata.types sao — confirmado lendo
// lib/typescript/index.d.ts) — nem em tipo nem em valor.
//
// BUG DE TIPO DA LIB: o .d.ts diz que exerciseRoute.type e o enum NUMERICO
// (DATA=0, ...), mas o Kotlin (ReactExerciseSessionRecord.parseRecord) faz
// putString("type", "DATA" | "NO_DATA" | "CONSENT_REQUIRED") -- em runtime
// e STRING (confirmado no device). Por isso os valores aqui sao string e as
// comparacoes fazem cast (o TS insiste que e number).
const EXERCISE_ROUTE_RESULT_TYPE = {
  DATA: 'DATA',
  NO_DATA: 'NO_DATA',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
} as const;

/** exerciseRoute.type em runtime e string (ver comentario acima) -- o tipo TS diz number, entao lemos via unknown. */
function exerciseRouteType(exerciseRoute: RecordResult<'ExerciseSession'>['exerciseRoute']): string | undefined {
  return exerciseRoute?.type as unknown as string | undefined;
}

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

/**
 * Implementacao Android do hub de saude, via Health Connect — espelha a
 * superficie de services/healthkit.ts (iOS). Etapas 1-3: abstracao,
 * instalacao/validacao, Passos + Calorias ativas. Etapas 4-6 (este arquivo
 * agora): Frequencia cardiaca, Sono, Treino/GPS.
 *
 * Os consumidores NAO devem importar deste arquivo diretamente; a decisao
 * iOS/Android vive em services/health.ts.
 */

/**
 * "Core" — o minimo que o card/grid da Home precisa pra considerar a conta
 * "conectada" (ensureHealthConnectAuthorized so checa isto). FC/Sono/Treino
 * sao pedidos junto no dialogo (ver HEALTH_CONNECT_ALL_REQUESTABLE_PERMISSIONS),
 * mas negar um deles individualmente nao deve travar Passos/Calorias, que
 * continuam funcionando sozinhos — cada leitura abaixo degrada pra "sem
 * dado" (null/vazio) de forma independente via safe().
 */
const HEALTH_CONNECT_READ_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
];

/**
 * Tudo que o app pede de uma vez so no dialogo do Health Connect — mesma
 * ideia do HEALTHKIT_READ_TYPES (healthkit.ts): 1 dialogo so, usuario escolhe
 * o que autorizar ali, sem pedir incrementalmente por secao.
 */
const HEALTH_CONNECT_ALL_REQUESTABLE_PERMISSIONS: Permission[] = [
  ...HEALTH_CONNECT_READ_PERMISSIONS,
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
];

// ─────────────────────────────────────────────────────────────────────────
// Disponibilidade / permissao — equivalem a isHealthKitAvailable /
// requestHealthKitPermissions / ensureHealthKitAuthorized de healthkit.ts
// (mesma assinatura: todas devolvem Promise<boolean>). Diferente do iOS, o
// Health Connect informa o status real de concessao (getGrantedPermissions),
// entao nao ha flag local equivalente a HEALTHKIT_CONNECTED_KEY: a checagem
// de "ja autorizado" e sempre a fonte de verdade.

/**
 * true se o app Health Connect esta instalado e pronto. false (sem lancar)
 * tanto se nao esta instalado quanto se precisa de atualizacao — getSdkStatus
 * distingue os 2 casos para quem quiser orientar o usuario.
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  const status = await getSdkStatus();
  return status === SdkAvailabilityStatus.SDK_AVAILABLE;
}

/** Inicializa o SDK do Health Connect — precisa rodar (e retornar true) antes de qualquer requestPermission/readRecords/aggregate. */
export async function initializeHealthConnect(): Promise<boolean> {
  return initialize();
}

/** Quais permissoes ja pedidas estao concedidas agora — sem abrir dialogo. */
export async function getGrantedHealthConnectPermissions(): Promise<Permission[]> {
  const granted = await getGrantedPermissions();
  return granted as Permission[];
}

/** true se TODAS as permissoes "core" (Steps + ActiveCaloriesBurned) estao concedidas. */
async function hasAllReadPermissions(): Promise<boolean> {
  const granted = await getGrantedHealthConnectPermissions();
  return HEALTH_CONNECT_READ_PERMISSIONS.every((needed) =>
    granted.some((g) => g.accessType === needed.accessType && g.recordType === needed.recordType)
  );
}

/**
 * Pede autorizacao pra tudo (Steps, ActiveCaloriesBurned, HeartRate,
 * SleepSession, ExerciseSession) num dialogo so, e devolve true se as "core"
 * (Steps + ActiveCaloriesBurned) foram concedidas — negar FC/Sono/Treino
 * individualmente nao falha a conexao, so deixa essas secoes em "sem dado"
 * ate o usuario conceder depois (Ajustes > Health Connect). Espelha
 * requestHealthKitPermissions() (tambem boolean), mas aqui o boolean reflete
 * concessao real do "core", nao so "o dialogo foi mostrado".
 */
export async function requestHealthConnectPermissions(): Promise<boolean> {
  const initialized = await initialize();
  if (!initialized) return false;
  await requestPermission(HEALTH_CONNECT_ALL_REQUESTABLE_PERMISSIONS);
  return hasAllReadPermissions();
}

/**
 * Pode seguir direto pra buscar dados? Equivale a ensureHealthKitAuthorized().
 * Sem o "re-pedir sozinho" do iOS (que existe la so por causa de tipos novos
 * adicionados depois que o usuario ja tinha conectado, num SO que nao expoe o
 * status de cada tipo) — no Health Connect basta consultar a concessao real.
 */
export async function ensureHealthConnectAuthorized(): Promise<boolean> {
  if (!(await isHealthConnectAvailable())) return false;
  if (!(await initialize())) return false;
  return hasAllReadPermissions();
}

/**
 * DEBUG -- so abre o dialogo de permissao do sistema se alguma das `needed`
 * ainda NAO estiver concedida. Chamar requestPermission() a cada toque do
 * botao de debug (mesmo com tudo ja concedido) reabre a Activity de
 * permissao a toa e as vezes pega uma janela de corrida do Android 14
 * (NullPointerException em Activity.requestPermissions -> startActivityForResult
 * -> dispatchCancelPendingInputEvents, confirmado em log, crasha o app pra
 * tela de erro do DevLauncher). Usado so pelas 2 funcoes de debug abaixo.
 */
async function requestWritePermissionsIfMissing(needed: Permission[]): Promise<void> {
  const granted = await getGrantedHealthConnectPermissions();
  const allGranted = needed.every((n) =>
    granted.some((g) => g.accessType === n.accessType && g.recordType === n.recordType)
  );
  if (!allGranted) {
    await requestPermission(needed);
  }
}

/**
 * DEBUG TEMPORARIO -- so pra validar a Etapa 3 no emulador. O Health Connect
 * (diferente do Apple Health no iOS) nao tem tela de "adicionar registro
 * manual", e nao existe jeito de popular dado via adb (o servico nao expoe
 * shell command nenhum, so o AIDL que so um app com permissao de escrita
 * consegue chamar) — ver investigacao. Esta funcao pede a permissao de
 * ESCRITA de Steps/ActiveCaloriesBurned (alem da leitura que o resto do app
 * usa) e insere 1 registro de cada cobrindo o dia de hoje, so pra ter um
 * numero real pra conferir na Home. REMOVER esta funcao (e o botao que a
 * chama em profile.tsx) depois que a Etapa 3 for validada -- o Tryv nao
 * escreve dado de saude em producao, so le.
 */
export async function insertHealthConnectDebugTestData(): Promise<{ steps: number; kcal: number }> {
  const initialized = await initialize();
  if (!initialized) throw new Error('Health Connect nao inicializado');

  const writePermissions: Permission[] = [
    { accessType: 'write', recordType: 'Steps' },
    { accessType: 'write', recordType: 'ActiveCaloriesBurned' },
  ];
  await requestWritePermissionsIfMissing(writePermissions);

  const steps = 8500;
  const kcal = 320;
  const startTime = startOfToday().toISOString();
  const endTime = new Date().toISOString();

  // insertRecords() da lib recusa (em JS, antes de chamar o nativo) um array
  // com mais de 1 recordType misturado ("All records must have the same
  // type") -- confirmado no log ao testar. 1 chamada por tipo.
  await insertRecords([{ recordType: 'Steps', startTime, endTime, count: steps }]);
  await insertRecords([
    { recordType: 'ActiveCaloriesBurned', startTime, endTime, energy: { value: kcal, unit: 'kilocalories' } },
  ]);

  return { steps, kcal };
}

/**
 * DEBUG TEMPORARIO -- mesma logica de insertHealthConnectDebugTestData()
 * acima, agora cobrindo FC (amostras ao longo do dia), Sono (1 sessao da
 * "ultima noite" com os 3 estagios reais + acordado) e 1 treino de corrida
 * com uma rota GPS simples (poligono pequeno, so pra testar a extracao de
 * pontos). REMOVER (esta funcao + o botao que a chama em profile.tsx) depois
 * que as Etapas 4-6 forem validadas -- o Tryv nao escreve dado de saude em
 * producao, so le.
 */
export async function insertHealthConnectDebugFcSonoTreino(): Promise<{
  heartRateSamples: number;
  sleepHours: number;
  workoutMinutes: number;
}> {
  const initialized = await initialize();
  if (!initialized) throw new Error('Health Connect nao inicializado');

  const writePermissions: Permission[] = [
    { accessType: 'write', recordType: 'HeartRate' },
    { accessType: 'write', recordType: 'SleepSession' },
    { accessType: 'write', recordType: 'ExerciseSession' },
    { accessType: 'write', recordType: 'ActiveCaloriesBurned' },
  ];
  await requestWritePermissionsIfMissing(writePermissions);

  const now = new Date();

  // O SDK nativo do Health Connect valida que sub-itens com timestamp (rota
  // de ExerciseSession, e -- pelo mesmo padrao -- amostras de HeartRate e
  // estagios de SleepSession) fiquem ESTRITAMENTE dentro do [startTime,
  // endTime] do registro pai; item batendo exatamente na borda ja deu
  // "route can not be out of parent time range" (confirmado em log). Todo
  // registro abaixo folga a propria janela alguns segundos alem do 1o/ultimo
  // sub-item pra nunca encostar na borda exata.
  const EDGE_MARGIN_MS = 10 * 1000;

  // Sono: "ultima noite" = ontem 23h -> hoje 6h30, com deep/light/rem/awake.
  // Calculado ANTES da FC de proposito -- a FC abaixo cobre a MESMA janela
  // (ver comentario la), entao a sessao de sono precisa existir primeiro.
  const wakeUp = new Date();
  wakeUp.setHours(6, 30, 0, 0);
  if (wakeUp > now) wakeUp.setDate(wakeUp.getDate() - 1);
  const bedtime = new Date(wakeUp);
  bedtime.setDate(bedtime.getDate() - 1);
  bedtime.setHours(23, 0, 0, 0);

  const stage = (startOffsetMin: number, durationMin: number, stageType: number) => {
    const start = new Date(bedtime.getTime() + startOffsetMin * 60 * 1000);
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString(), stage: stageType };
  };
  const sleepStages = [
    stage(0, 20, SleepStageType.AWAKE), // pegando no sono
    stage(20, 90, SleepStageType.LIGHT),
    stage(110, 60, SleepStageType.DEEP),
    stage(170, 40, SleepStageType.REM),
    stage(210, 100, SleepStageType.LIGHT),
    stage(310, 50, SleepStageType.DEEP),
    stage(360, 30, SleepStageType.REM),
    stage(390, 60, SleepStageType.LIGHT),
  ];
  const sleepEndOffsetMin = 450; // 7h30 depois do bedtime == wakeUp
  // Janela do registro de sono folgada alem do 1o/ultimo estagio (o 1o
  // estagio comeca exatamente em bedtime e o ultimo termina exatamente em
  // wakeUp) -- ver EDGE_MARGIN_MS.
  const sleepSessionStart = new Date(bedtime.getTime() - EDGE_MARGIN_MS);
  const sleepSessionEnd = new Date(wakeUp.getTime() + EDGE_MARGIN_MS);

  // FC: amostras a cada 15min cobrindo A MESMA janela da sessao de sono
  // (bedtime -> wakeUp), de proposito -- gerar "ultimas 3h" independente da
  // sessao de sono (como era antes) nunca se sobrepoe com ela quando o botao
  // e tocado de dia, entao "FC no sono" (SleepDetailView) sempre ficava em
  // "--" no teste, mesmo com FC e Sono os dois inseridos com sucesso.
  const hrSamples: { time: string; beatsPerMinute: number }[] = [];
  for (let t = bedtime.getTime(); t <= wakeUp.getTime(); t += 15 * 60 * 1000) {
    const minutesFromBedtime = (t - bedtime.getTime()) / (60 * 1000);
    const bpm = 58 + Math.round(Math.sin(minutesFromBedtime / 30) * 6);
    hrSamples.push({ time: new Date(t).toISOString(), beatsPerMinute: bpm });
  }
  // Janela do registro folgada alem da 1a/ultima amostra (ver EDGE_MARGIN_MS).
  const hrStart = new Date(new Date(hrSamples[0].time).getTime() - EDGE_MARGIN_MS);
  const hrEnd = new Date(new Date(hrSamples[hrSamples.length - 1].time).getTime() + EDGE_MARGIN_MS);

  // Treino: corrida de 25min terminando ha 1h, rota GPS pequena (poligono
  // fechado de 6 pontos, ~200m de lado) so pra testar extracao de pontos.
  const workoutEnd = new Date(now.getTime() - 60 * 60 * 1000);
  const workoutStart = new Date(workoutEnd.getTime() - 25 * 60 * 1000);
  const baseLat = -23.5505;
  const baseLng = -46.6333;
  // GAP DA LIB (react-native-health-connect): o tipo TS de Location marca
  // horizontalAccuracy/verticalAccuracy/altitude como opcionais (Length?),
  // mas ReactExerciseSessionRecord.kt:29-33 (parseWriteRecord) chama
  // getLengthFromJsMap() nos 3 SEM checar null -- omitir qualquer um deles
  // lanca "InvalidLength: Length is not valid" no insertRecords() (confirmado
  // em log). Os 3 sao obrigatorios na pratica pra ESCRITA de rota, apesar do
  // tipo dizer o contrario. Se outro lugar do app um dia escrever
  // ExerciseSessionRecord com rota (hoje so leitura, via fetchRecentWorkouts
  // -- nenhum treino real e gravado de volta no Health Connect), lembrar
  // disso.
  // Pontos da rota folgados pra dentro do [workoutStart, workoutEnd] (ver
  // EDGE_MARGIN_MS) -- aqui a margem e "pra dentro" porque a janela do
  // treino e fixa; nos outros registros e "pra fora" porque la a janela do
  // registro e que folga.
  const routeStart = new Date(workoutStart.getTime() + EDGE_MARGIN_MS);
  const routeEnd = new Date(workoutEnd.getTime() - EDGE_MARGIN_MS);
  const routePoints = Array.from({ length: 6 }, (_, i) => {
    const t = new Date(routeStart.getTime() + (i / 5) * (routeEnd.getTime() - routeStart.getTime()));
    const angle = (i / 6) * Math.PI * 2;
    return {
      time: t.toISOString(),
      latitude: baseLat + Math.cos(angle) * 0.0018,
      longitude: baseLng + Math.sin(angle) * 0.0018,
      altitude: { value: 760 + i, unit: 'meters' as const },
      horizontalAccuracy: { value: 5, unit: 'meters' as const },
      verticalAccuracy: { value: 8, unit: 'meters' as const },
    };
  });

  // Mesma restricao de insertRecords() (1 recordType por chamada) do
  // comentario em insertHealthConnectDebugTestData() acima -- aqui eram 4
  // tipos misturados numa chamada so, mesmo erro na pratica.
  await insertRecords([
    { recordType: 'HeartRate', startTime: hrStart.toISOString(), endTime: hrEnd.toISOString(), samples: hrSamples },
  ]);
  await insertRecords([
    {
      recordType: 'SleepSession',
      startTime: sleepSessionStart.toISOString(),
      endTime: sleepSessionEnd.toISOString(),
      stages: sleepStages,
    },
  ]);
  await insertRecords([
    {
      recordType: 'ExerciseSession',
      startTime: workoutStart.toISOString(),
      endTime: workoutEnd.toISOString(),
      exerciseType: 56 /* ExerciseType.RUNNING */,
      title: '[DEBUG] Corrida de teste',
      exerciseRoute: { route: routePoints },
    },
  ]);
  await insertRecords([
    {
      recordType: 'ActiveCaloriesBurned',
      startTime: workoutStart.toISOString(),
      endTime: workoutEnd.toISOString(),
      energy: { value: 210, unit: 'kilocalories' },
    },
  ]);

  return { heartRateSamples: hrSamples.length, sleepHours: sleepEndOffsetMin / 60, workoutMinutes: 25 };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers de data / janela de historico — copiados VERBATIM de
// services/healthkit.ts de proposito: aquela logica de janela (1d/7d/4w
// diarios, 1y em 12 meses civis) espelha _resolve_summary_window de
// app/routers/meals.py, e as duas plataformas do app precisam navegar o
// historico exatamente igual. Manter as copias em sincronia se uma mudar.

function startOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const endOrdinal = today.getFullYear() * 12 + today.getMonth() - offset * 12;
  const startOrdinal = endOrdinal - 11;
  const start = new Date(Math.floor(startOrdinal / 12), ((startOrdinal % 12) + 12) % 12, 1);
  const end = new Date(Math.floor(endOrdinal / 12), (((endOrdinal % 12) + 12) % 12) + 1, 0);
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

async function buildHistory(
  period: HealthHistoryPeriod,
  offset: number,
  fetchBuckets: (start: Date, end: Date, granularity: HealthHistoryGranularity) => Promise<Map<string, number>>
): Promise<HealthMetricHistory> {
  const { start, end, granularity } = resolveHistoryWindow(period, offset);
  // safeWithForegroundRetry: fetchHealthMetricHistory tambem roda no meio da
  // transicao pra /health/[metric] (ver fetchDayHeartRateDetail) -- sem isso,
  // o aggregate lanca "must be in foreground" e a tela vai pra estado de
  // erro so por timing. Falha real (ou retries esgotados) -> historico vazio.
  const byKey = (await safeWithForegroundRetry(() => fetchBuckets(start, end, granularity))) ?? new Map<string, number>();
  const keys = buildBucketKeys(start, end, granularity);
  const points: HealthHistoryPoint[] = keys.map((key) => ({ date: key, value: byKey.has(key) ? byKey.get(key)! : null }));

  const withData = points.filter((p): p is HealthHistoryPoint & { value: number } => p.value != null);
  const average = withData.length ? withData.reduce((sum, p) => sum + p.value, 0) / withData.length : null;

  return { period, granularity, offset, startDate: toDateKey(start), endDate: toDateKey(end), points, average };
}

/** Roda uma busca e engole falha (transiente ou de tipo nao autorizado) virando null. Mesmo helper de healthkit.ts. */
async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Igual a safe(), mas re-tenta algumas vezes quando o erro e o transiente de
 * "app ainda nao esta em foreground" do Health Connect (SecurityException:
 * "must be in foreground to call aggregate method"). Isso acontece quando o
 * fetch dispara no mount de um card durante a transicao de aba, antes do SO
 * considerar o app em foreground — sem re-tentar, o safe() engole e o tile
 * fica preso em "--" so por timing. Aceita uma factory (nao uma Promise) pra
 * poder re-invocar. Qualquer outro erro (ou retries esgotados) vira null,
 * igual safe().
 */
async function safeWithForegroundRetry<T>(factory: () => Promise<T>, attempts = 4, delayMs = 250): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await factory();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isForegroundRace = /must be in foreground|foreground to call/i.test(message);
      if (!isForegroundRace || i === attempts - 1) return null;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

/**
 * initialize() e idempotente e barato; chamamos no inicio de cada leitura
 * publica pra elas nao dependerem da ordem de chamada (o fluxo da Home ja
 * roda ensureHealthConnectAuthorized antes, que inicializa — mas telas/
 * componentes que buscam dado direto nao deveriam precisar saber disso).
 */
async function ensureInitialized(): Promise<void> {
  await initialize();
}

/**
 * Le TODAS as paginas de readRecords ate acabar ou bater maxRecords —
 * generico sobre o RecordType porque HeartRate/SleepSession/ExerciseSession
 * usam exatamente a mesma paginacao, so o tipo muda.
 */
async function readAllPages<T extends 'HeartRate' | 'SleepSession' | 'ExerciseSession'>(
  recordType: T,
  timeRangeFilter: { operator: 'between'; startTime: string; endTime: string },
  ascendingOrder: boolean,
  maxRecords: number
): Promise<RecordResult<T>[]> {
  const records: RecordResult<T>[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(recordType, {
      timeRangeFilter,
      ascendingOrder,
      pageSize: 200,
      pageToken,
    });
    records.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken && records.length < maxRecords);
  return records;
}

// ─────────────────────────────────────────────────────────────────────────
// Passos e Calorias ativas — Etapa 3. Leitura agregada via Health Connect.
// aggregateRecord = 1 total pra janela (equivale a
// queryStatisticsForQuantity['cumulativeSum']); aggregateGroupByPeriod = 1
// bucket por dia/mes de uma vez (equivale a
// queryStatisticsCollectionForQuantity com intervalComponents).
//
// DIFERENCA DE SEMANTICA vs. HealthKit, de proposito: o Health Connect nao
// distingue "zero" de "sem amostra" numa agregacao (COUNT_TOTAL/
// ACTIVE_CALORIES_TOTAL vem 0 nos dois casos). Tratamos value <= 0 como
// "sem dado" (null) — mesmo efeito visual do iOS (barra vazia, dia fora da
// media) e correto na pratica pra passos/calorias, ao custo de um dia real
// de zero atividade aparecer como "--" em vez de "0". Mesma disciplina
// aplicada a FC/Sono/Treino abaixo.

type HealthConnectMetric = 'Steps' | 'ActiveCaloriesBurned';

const METRIC_BY_KEY: Record<'steps' | 'calories', HealthConnectMetric> = {
  steps: 'Steps',
  calories: 'ActiveCaloriesBurned',
};

/** Total cumulativo (passos ou kcal) desde `since` ate agora. null quando <= 0 (ver nota de semantica acima). */
async function aggregateTotal(recordType: HealthConnectMetric, since: Date): Promise<number | null> {
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: since.toISOString(),
    endTime: new Date().toISOString(),
  };

  if (recordType === 'Steps') {
    const res = await aggregateRecord({ recordType: 'Steps', timeRangeFilter });
    return res.COUNT_TOTAL > 0 ? res.COUNT_TOTAL : null;
  }
  const res = await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter });
  const kcal = res.ACTIVE_CALORIES_TOTAL.inKilocalories;
  return kcal > 0 ? kcal : null;
}

/**
 * aggregateGroupByPeriod devolve startTime como LocalDateTime sem zona
 * ("2024-01-15T00:00"). Recortamos o prefixo pra chave 'YYYY-MM-DD' (dia) ou
 * 'YYYY-MM' (mes), mesmo formato de toDateKey/toMonthKey.
 */
function bucketKeyFromNative(nativeStartTime: string, granularity: HealthHistoryGranularity): string {
  return granularity === 'day' ? nativeStartTime.slice(0, 10) : nativeStartTime.slice(0, 7);
}

/** Soma por bucket diario/mensal via aggregateGroupByPeriod. Buckets com valor <= 0 ficam de fora do Map (= "sem dado"). */
async function aggregateBuckets(
  recordType: HealthConnectMetric,
  start: Date,
  end: Date,
  granularity: HealthHistoryGranularity
): Promise<Map<string, number>> {
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: endOfDay(end).toISOString(),
  };
  const timeRangeSlicer =
    granularity === 'day' ? { period: 'DAYS' as const, length: 1 } : { period: 'MONTHS' as const, length: 1 };

  const byKey = new Map<string, number>();

  if (recordType === 'Steps') {
    const groups = await aggregateGroupByPeriod({ recordType: 'Steps', timeRangeFilter, timeRangeSlicer });
    for (const group of groups) {
      if (group.result.COUNT_TOTAL > 0) {
        byKey.set(bucketKeyFromNative(group.startTime, granularity), group.result.COUNT_TOTAL);
      }
    }
    return byKey;
  }

  const groups = await aggregateGroupByPeriod({ recordType: 'ActiveCaloriesBurned', timeRangeFilter, timeRangeSlicer });
  for (const group of groups) {
    const kcal = group.result.ACTIVE_CALORIES_TOTAL.inKilocalories;
    if (kcal > 0) byKey.set(bucketKeyFromNative(group.startTime, granularity), kcal);
  }
  return byKey;
}

/** Passos dia a dia dos ultimos 7 dias (hoje incluso), pro grafico de barras da semana. */
export async function fetchStepsLast7Days(): Promise<DailyQuantityPoint[]> {
  return fetchDailyLast7Days('Steps');
}

/** Calorias ativas dia a dia dos ultimos 7 dias — mesmo uso, so muda o tipo. */
export async function fetchActiveEnergyLast7Days(): Promise<DailyQuantityPoint[]> {
  return fetchDailyLast7Days('ActiveCaloriesBurned');
}

async function fetchDailyLast7Days(recordType: HealthConnectMetric): Promise<DailyQuantityPoint[]> {
  await ensureInitialized();
  const start = startOfToday();
  start.setDate(start.getDate() - 6);
  const byDate = await aggregateBuckets(recordType, start, startOfToday(), 'day');

  const points: DailyQuantityPoint[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    const key = toDateKey(day);
    points.push({ date: key, value: byDate.has(key) ? byDate.get(key)! : null });
  }
  return points;
}

// ─────────────────────────────────────────────────────────────────────────
// Frequencia cardiaca (Etapa 4). HeartRateRecord agrupa amostras
// (samples: {time, beatsPerMinute}[]) num intervalo — diferente do
// HealthKit, que grava 1 amostra por vez.
//
// restingBpm fica SEMPRE null no Android: o HealthKit calcula
// HKQuantityTypeIdentifierRestingHeartRate com seu proprio algoritmo, e o
// equivalente no Health Connect e um RECORD TYPE separado (RestingHeartRate)
// que exigiria uma permissao a mais (READ_RESTING_HEART_RATE) nao pedida
// nesta etapa — mesma disciplina "sem dado real = mostrar '--'" do resto do
// app, em vez de aproximar com um numero calculado aqui que pareceria oficial
// mas nao seria a mesma metrica.

async function readHeartRateSamplesInRange(since: Date, until: Date): Promise<HeartRateSamplePoint[]> {
  const timeRangeFilter = { operator: 'between' as const, startTime: since.toISOString(), endTime: until.toISOString() };
  const records = await readAllPages('HeartRate', timeRangeFilter, true, 20);
  const points: HeartRateSamplePoint[] = [];
  for (const record of records) {
    for (const sample of record.samples) {
      points.push({ bpm: Math.round(sample.beatsPerMinute), recordedAt: sample.time });
    }
  }
  points.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  // Mesmo teto de fetchHeartRateSamplesSince (healthkit.ts, limit:500) —
  // protege o POST /heart-rate/sync de um lote gigante de uma vez.
  return points.slice(0, 500);
}

/** Amostras BRUTAS de FC desde `sinceDate`, ordenadas da mais antiga pra mais nova — usadas pra sincronizar com o backend (POST /heart-rate/sync). */
export async function fetchHeartRateSamplesSince(sinceDate: Date): Promise<HeartRateSamplePoint[]> {
  await ensureInitialized();
  return readHeartRateSamplesInRange(sinceDate, new Date());
}

/** Leitura mais recente de FC, so se tiver no maximo maxAgeMs de idade — usada durante uma atividade ao vivo. */
export async function fetchRecentHeartRateBpm(maxAgeMs: number): Promise<number | null> {
  await ensureInitialized();
  const samples = await readHeartRateSamplesInRange(new Date(Date.now() - maxAgeMs), new Date());
  return samples.length > 0 ? samples[samples.length - 1].bpm : null;
}

/** Media de FC numa janela de tempo arbitraria — usado pro "bpm med." de cada atividade (HeartRateDetailView). */
export async function fetchAverageHeartRate(start: Date, end: Date): Promise<number | null> {
  await ensureInitialized();
  const res = await safe(
    aggregateRecord({
      recordType: 'HeartRate',
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    })
  );
  return res && res.BPM_AVG > 0 ? Math.round(res.BPM_AVG) : null;
}

async function aggregatePeakHeartRate(start: Date, end: Date): Promise<number | null> {
  const res = await aggregateRecord({
    recordType: 'HeartRate',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
  });
  return res.BPM_MAX > 0 ? Math.round(res.BPM_MAX) : null;
}

/** Buckets de 10min (media), equivalente a fetchIntradayHeartRatePoints de healthkit.ts — aqui via aggregateGroupByDuration. */
async function fetchIntradayHeartRatePoints(dayStart: Date, dayEnd: Date): Promise<HeartRateIntradayPoint[]> {
  const groups = await aggregateGroupByDuration({
    recordType: 'HeartRate',
    timeRangeFilter: { operator: 'between', startTime: dayStart.toISOString(), endTime: dayEnd.toISOString() },
    timeRangeSlicer: { duration: 'MINUTES', length: 10 },
  });
  const points: HeartRateIntradayPoint[] = [];
  for (const group of groups) {
    if (group.result.BPM_AVG > 0) points.push({ time: group.startTime, bpm: Math.round(group.result.BPM_AVG) });
  }
  return points;
}

/** Detalhe de FC de 1 dia (dayOffset=0 e hoje). restingBpm sempre null (ver nota acima). */
export async function fetchDayHeartRateDetail(dayOffset = 0): Promise<DayHeartRateDetail> {
  await ensureInitialized();
  const day = addDays(startOfToday(), -dayOffset);
  const dayEnd = endOfDay(day);

  // safeWithForegroundRetry (nao safe): esta tela abre por navegacao pra
  // /health/[metric], e o aggregate do HeartRate roda no meio da transicao,
  // frequentemente antes do SO considerar o app em foreground -> "must be in
  // foreground" engolido pelo safe -> "Sem leituras de FC neste dia" so por
  // timing. Mesmo padrao ja aplicado em fetchHealthSummary.
  const [points, peakBpm] = await Promise.all([
    safeWithForegroundRetry(() => fetchIntradayHeartRatePoints(day, dayEnd)),
    safeWithForegroundRetry(() => aggregatePeakHeartRate(day, dayEnd)),
  ]);

  return { date: toDateKey(day), points: points ?? [], restingBpm: null, peakBpm: peakBpm ?? null };
}

async function aggregateDailyPeakHeartRate(start: Date, end: Date): Promise<Map<string, number>> {
  const timeRangeFilter = { operator: 'between' as const, startTime: start.toISOString(), endTime: endOfDay(end).toISOString() };
  const groups = await aggregateGroupByPeriod({
    recordType: 'HeartRate',
    timeRangeFilter,
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  const byDay = new Map<string, number>();
  for (const group of groups) {
    if (group.result.BPM_MAX > 0) byDay.set(bucketKeyFromNative(group.startTime, 'day'), Math.round(group.result.BPM_MAX));
  }
  return byDay;
}

/** Detalhe de FC dos ultimos 7 dias (weekOffset=0). restingBpm sempre null (ver nota acima). */
export async function fetchWeekHeartRateDetail(weekOffset = 0): Promise<WeekHeartRateDetail> {
  await ensureInitialized();
  const end = addDays(startOfToday(), -weekOffset * 7);
  const start = addDays(end, -6);
  // Mesma corrida de foreground de fetchDayHeartRateDetail (aba "Semana" da
  // mesma tela) -- ver comentario la.
  const peakByDay = await safeWithForegroundRetry(() => aggregateDailyPeakHeartRate(start, end));

  const days: WeekHeartRateDayPoint[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    const key = toDateKey(day);
    days.push({ date: key, restingBpm: null, peakBpm: peakByDay?.get(key) ?? null });
  }

  const peakValues = days.map((d) => d.peakBpm).filter((v): v is number => v != null);
  return {
    days,
    avgRestingBpm: null,
    avgPeakBpm: peakValues.length ? Math.round(peakValues.reduce((sum, v) => sum + v, 0) / peakValues.length) : null,
  };
}

async function aggregateHeartRateBuckets(start: Date, end: Date, granularity: HealthHistoryGranularity): Promise<Map<string, number>> {
  const timeRangeFilter = { operator: 'between' as const, startTime: start.toISOString(), endTime: endOfDay(end).toISOString() };
  const timeRangeSlicer =
    granularity === 'day' ? { period: 'DAYS' as const, length: 1 } : { period: 'MONTHS' as const, length: 1 };
  const groups = await aggregateGroupByPeriod({ recordType: 'HeartRate', timeRangeFilter, timeRangeSlicer });
  const byKey = new Map<string, number>();
  for (const group of groups) {
    if (group.result.BPM_AVG > 0) byKey.set(bucketKeyFromNative(group.startTime, granularity), Math.round(group.result.BPM_AVG));
  }
  return byKey;
}

// ─────────────────────────────────────────────────────────────────────────
// Sono (Etapa 5). SleepSessionRecord ja modela uma "sessao" nativamente
// (diferente do HealthKit, que grava amostras soltas de categoria) — mas o
// MESMO tipo de bug ("2 noites/apps somados") pode acontecer aqui se mais de
// 1 app (ou 1 app + o proprio Tryv) escrever sessoes sobrepostas/proximas.
// groupIntoSessions() abaixo e a MESMA protecao de groupSamplesIntoSessions
// (healthkit.ts): agrupa por gap de ate 90min e usa so o grupo mais recente.

const SLEEP_SESSION_GAP_MINUTES = 90;

/** Generico o bastante pra reaproveitar tanto pra registros (Sono) quanto, no futuro, amostras soltas — mesmo algoritmo de groupSamplesIntoSessions em healthkit.ts. */
function groupIntoSessions<T extends { startDate: Date; endDate: Date }>(items: T[]): T[][] {
  const sessions: T[][] = [];
  let current: T[] = [];
  let currentMaxEnd = 0;

  for (const item of items) {
    if (current.length === 0) {
      current = [item];
      currentMaxEnd = item.endDate.getTime();
      continue;
    }
    const gapMinutes = (item.startDate.getTime() - currentMaxEnd) / (1000 * 60);
    if (gapMinutes > SLEEP_SESSION_GAP_MINUTES) {
      sessions.push(current);
      current = [item];
      currentMaxEnd = item.endDate.getTime();
    } else {
      current.push(item);
      currentMaxEnd = Math.max(currentMaxEnd, item.endDate.getTime());
    }
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

interface SleepStageEntry {
  startDate: Date;
  endDate: Date;
  stage: number;
}

/** HealthKit nao tem estagio "leve" separado de "core" (Core JA E leve) — aqui LIGHT e SLEEPING (generico/nao diferenciado) mapeiam pro mesmo 'core', mesmo tratamento de asleepUnspecified em healthkit.ts. Health Connect nao expoe um conceito de "inBed" separado de acordado, entao esse valor do nosso SleepStage nunca sai daqui. */
function mapSleepStage(stage: number): SleepStage | null {
  switch (stage) {
    case SleepStageType.DEEP:
      return 'deep';
    case SleepStageType.LIGHT:
      return 'core';
    case SleepStageType.SLEEPING:
      return 'core';
    case SleepStageType.REM:
      return 'rem';
    case SleepStageType.AWAKE:
      return 'awake';
    case SleepStageType.OUT_OF_BED:
      return 'awake';
    default:
      return null; // UNKNOWN
  }
}

/** Busca a sessao de sono mais recente (agrupando por gap, ver comentario acima) nas ultimas 32h — mesma janela de fetchLastNightSleepHours/fetchSleepSessionDetail em healthkit.ts. */
async function fetchLatestSleepSession(): Promise<{ startDate: Date; endDate: Date; stages: SleepStageEntry[] } | null> {
  const since = daysAgo(32 / 24);
  const timeRangeFilter = { operator: 'between' as const, startTime: since.toISOString(), endTime: new Date().toISOString() };
  const records = await readAllPages('SleepSession', timeRangeFilter, true, 20);
  if (records.length === 0) return null;

  const windows = records.map((record) => ({
    startDate: new Date(record.startTime),
    endDate: new Date(record.endTime),
    // Registro sem estagio (fonte que so grava inicio/fim, sem diferenciar)
    // vira 1 "bloco" so tratado como sono generico ('core', mesmo raciocinio
    // do LIGHT/SLEEPING acima) cobrindo o intervalo inteiro do registro —
    // aproximacao deliberada, melhor que descartar o registro inteiro.
    stages: (record.stages && record.stages.length > 0
      ? record.stages
      : [{ startTime: record.startTime, endTime: record.endTime, stage: SleepStageType.SLEEPING }]
    ).map((s) => ({ startDate: new Date(s.startTime), endDate: new Date(s.endTime), stage: s.stage })),
  }));

  const sessions = groupIntoSessions(windows);
  const latest = sessions[sessions.length - 1];

  const stages = latest.flatMap((w) => w.stages).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const startDate = latest.reduce((min, w) => (w.startDate < min ? w.startDate : min), latest[0].startDate);
  const endDate = latest.reduce((max, w) => (w.endDate > max ? w.endDate : max), latest[0].endDate);
  return { startDate, endDate, stages };
}

/** Exportada tambem isoladamente pro Score de Prontidao (mesmo motivo de healthkit.ts). */
export async function fetchLastNightSleepHours(): Promise<number | null> {
  await ensureInitialized();
  // Sem safe() aqui de proposito: deixa o erro transiente de "must be in
  // foreground" propagar pra quem chama tratar (fetchHealthSummary re-tenta
  // via safeWithForegroundRetry). fetchLatestSleepSession() ja e chamado sem
  // safe por fetchSleepSessionDetail tambem.
  const session = await fetchLatestSleepSession();
  if (!session) return null;
  const totalMs = session.stages
    .filter((s) => {
      const mapped = mapSleepStage(s.stage);
      return mapped === 'deep' || mapped === 'core' || mapped === 'rem';
    })
    .reduce((sum, s) => sum + (s.endDate.getTime() - s.startDate.getTime()), 0);
  return totalMs > 0 ? totalMs / (1000 * 60 * 60) : null;
}

/** Detalhe completo da ultima noite — mesmo shape de fetchSleepSessionDetail (healthkit.ts). respiratoryRate sempre null (RespiratoryRate exigiria permissao a mais nao pedida nesta etapa); heartRate usa a mesma permissao de FC (ja pedida). */
export async function fetchSleepSessionDetail(): Promise<SleepSessionDetail | null> {
  await ensureInitialized();
  // safeWithForegroundRetry: mesma corrida de foreground das telas de detalhe
  // (abre por navegacao pra /health/[metric]) -- ver fetchDayHeartRateDetail.
  const session = await safeWithForegroundRetry(() => fetchLatestSleepSession());
  if (!session) return null;

  const breakdown: SleepStageBreakdown = { deepMinutes: 0, lightMinutes: 0, remMinutes: 0, awakeMinutes: 0, totalAsleepMinutes: 0 };
  const segments: SleepStageSegment[] = [];

  for (const entry of session.stages) {
    const stage = mapSleepStage(entry.stage);
    if (!stage) continue;
    segments.push({ stage, startDate: entry.startDate.toISOString(), endDate: entry.endDate.toISOString() });
    const minutes = (entry.endDate.getTime() - entry.startDate.getTime()) / (1000 * 60);
    if (stage === 'deep') breakdown.deepMinutes += minutes;
    else if (stage === 'core') breakdown.lightMinutes += minutes;
    else if (stage === 'rem') breakdown.remMinutes += minutes;
    else if (stage === 'awake') breakdown.awakeMinutes += minutes;
  }
  if (segments.length === 0) return null;
  breakdown.totalAsleepMinutes = breakdown.deepMinutes + breakdown.lightMinutes + breakdown.remMinutes;

  const heartRateStats = await safeWithForegroundRetry(() =>
    aggregateRecord({
      recordType: 'HeartRate',
      timeRangeFilter: { operator: 'between', startTime: session.startDate.toISOString(), endTime: session.endDate.toISOString() },
    })
  );

  return {
    date: toDateKey(session.endDate),
    startedAt: session.startDate.toISOString(),
    endedAt: session.endDate.toISOString(),
    breakdown,
    segments,
    heartRate: {
      average: heartRateStats && heartRateStats.BPM_AVG > 0 ? Math.round(heartRateStats.BPM_AVG) : null,
      lowest: heartRateStats && heartRateStats.BPM_MIN > 0 ? Math.round(heartRateStats.BPM_MIN) : null,
    },
    respiratoryRate: { average: null, lowest: null },
  };
}

/**
 * Sono por bucket diario/mensal, pro historico (app/health/[metric].tsx).
 * Diferente de fetchLatestSleepSession (que agrupa por sessao pra pegar SO
 * a noite mais recente com seguranca), aqui bucketamos os registros crus por
 * data de despertar (endTime) — agrupar sessao a sessao pro historico
 * inteiro (potencialmente 1 ano) seria caro demais; o risco remanescente
 * (2 registros da MESMA noite contados 2x nesta visao agregada) e aceito
 * como trade-off, o numero de "ultima noite" acima (o que a Home/Prontidao
 * usa) continua protegido.
 */
async function aggregateSleepHistoryBuckets(start: Date, end: Date, granularity: HealthHistoryGranularity): Promise<Map<string, number>> {
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: addDays(start, -1).toISOString(),
    endTime: addDays(endOfDay(end), 1).toISOString(),
  };
  const records = await readAllPages('SleepSession', timeRangeFilter, true, 400);

  const byKey = new Map<string, number>();
  for (const record of records) {
    const recordEnd = new Date(record.endTime);
    const key = granularity === 'day' ? toDateKey(recordEnd) : toMonthKey(recordEnd);
    const stageEntries =
      record.stages && record.stages.length > 0
        ? record.stages.map((s) => ({ startDate: new Date(s.startTime), endDate: new Date(s.endTime), stage: s.stage }))
        : [{ startDate: new Date(record.startTime), endDate: recordEnd, stage: SleepStageType.SLEEPING }];
    const hours = stageEntries
      .filter((s) => {
        const mapped = mapSleepStage(s.stage);
        return mapped === 'deep' || mapped === 'core' || mapped === 'rem';
      })
      .reduce((sum, s) => sum + (s.endDate.getTime() - s.startDate.getTime()) / (1000 * 60 * 60), 0);
    if (hours > 0) byKey.set(key, (byKey.get(key) ?? 0) + hours);
  }
  return byKey;
}

// ─────────────────────────────────────────────────────────────────────────
// Treino / GPS (Etapa 6). ExerciseSessionRecord nao carrega distancia nem
// calorias direto (diferente do WorkoutProxyTyped do HealthKit) — sao tipos
// separados no Health Connect. Calorias reaproveitam a MESMA permissao de
// ActiveCaloriesBurned (Etapa 3, ja concedida); distancia exigiria
// READ_DISTANCE a mais, nao pedida nesta etapa — fica no padrao "sem dado".

/** So os tipos que o app ja usa — mesmo espirito de WORKOUT_TYPE_MAP em healthkit.ts (o resto cai em 'other', incluindo WALKING, que tambem nao esta mapeado la). */
const EXERCISE_TYPE_MAP: Partial<Record<number, ActivityType>> = {
  56: 'run', // RUNNING
  57: 'run', // RUNNING_TREADMILL
  8: 'bike', // BIKING
  9: 'bike', // BIKING_STATIONARY
  73: 'swim', // SWIMMING_OPEN_WATER
  74: 'swim', // SWIMMING_POOL
  11: 'fight', // BOXING
  44: 'fight', // MARTIAL_ARTS
  36: 'hiit', // HIGH_INTENSITY_INTERVAL_TRAINING
};

function mapExerciseType(exerciseType: number): ActivityType {
  return EXERCISE_TYPE_MAP[exerciseType] ?? 'other';
}

/** Length pode vir em qualquer unidade — convertemos pra metros com base na unidade, mesmo raciocinio de quantityToMeters em healthkit.ts. */
function lengthToMeters(length: { value: number; unit: string }): number {
  switch (length.unit) {
    case 'kilometers':
      return length.value * 1000;
    case 'miles':
      return length.value * 1609.344;
    case 'feet':
      return length.value * 0.3048;
    case 'inches':
      return length.value * 0.0254;
    default:
      return length.value; // 'meters'
  }
}

function locationToRoutePoint(location: {
  time: string;
  latitude: number;
  longitude: number;
  altitude?: { value: number; unit: string };
}): RoutePoint {
  return {
    lat: location.latitude,
    lng: location.longitude,
    timestamp: location.time,
    alt: location.altitude ? lengthToMeters(location.altitude) : null,
  };
}

/**
 * Rota GPS de 1 treino. O registro (record.exerciseRoute) ja vem com a rota
 * inline (type=DATA) quando o proprio Tryv escreveu o treino (ou quando o
 * app de origem ja liberou acesso) — so cai no consentimento explicito
 * (requestExerciseRoute, dialogo do sistema pra ESTE registro especifico)
 * quando o Health Connect marca type=CONSENT_REQUIRED (treino de outro app
 * ainda nao autorizado). NO_DATA / campo ausente = sem rota mesmo.
 */
async function extractExerciseRoutePoints(
  exerciseRoute: RecordResult<'ExerciseSession'>['exerciseRoute'],
  recordId: string | undefined
): Promise<RoutePoint[] | null> {
  const routeType = exerciseRouteType(exerciseRoute);
  if (exerciseRoute && routeType === EXERCISE_ROUTE_RESULT_TYPE.DATA && exerciseRoute.route.length > 0) {
    return exerciseRoute.route.map(locationToRoutePoint);
  }
  // CONSENT_REQUIRED (rota de outro app) e NO_DATA sao tratados igual: no
  // Android, um ExerciseSession COM rota volta do readRecords() como NO_DATA
  // enquanto READ_EXERCISE_ROUTES nao estiver concedida -- e essa permissao
  // NAO pode ser pedida via requestPermission() nesta lib (o tipo Permission
  // nao aceita read+ExerciseRoute e o Kotlin lancaria InvalidRecordType);
  // so o usuario ligando "Rotas de exercicio" em Ajustes > Health Connect,
  // ou este requestExerciseRoute() por-registro (dialogo do sistema pra
  // ESTE treino especifico). Se falhar/for negado, o chamador cai no
  // fallback de atividade manual (sem rota) e avisa na tela de importacao.
  const routeMaybePresent =
    routeType === EXERCISE_ROUTE_RESULT_TYPE.CONSENT_REQUIRED || routeType === EXERCISE_ROUTE_RESULT_TYPE.NO_DATA;
  if (routeMaybePresent && recordId) {
    try {
      const locations = await requestExerciseRoute(recordId);
      return locations.length > 0 ? locations.map(locationToRoutePoint) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * true se o treino provavelmente TEM rota GPS no Health Connect mas ela nao
 * pode ser lida agora (falta READ_EXERCISE_ROUTES, ou o dialogo por-registro
 * foi negado). Usado pela tela de importacao pra avisar o usuario -- ver
 * comentario em extractExerciseRoutePoints.
 */
function isExerciseRouteBlocked(
  exerciseRoute: RecordResult<'ExerciseSession'>['exerciseRoute'],
  extractedPoints: RoutePoint[] | null
): boolean {
  if (extractedPoints && extractedPoints.length > 0) return false;
  const routeType = exerciseRouteType(exerciseRoute);
  return routeType === EXERCISE_ROUTE_RESULT_TYPE.CONSENT_REQUIRED || routeType === EXERCISE_ROUTE_RESULT_TYPE.NO_DATA;
}

/** Abre a tela do app Health Connect (pra o usuario ajustar permissoes manualmente, ex: "Rotas de exercicio"). */
export function openHealthConnectAppSettings(): void {
  openHealthConnectSettings();
}

async function aggregateActiveCaloriesForWindow(start: Date, end: Date): Promise<number | null> {
  const res = await aggregateRecord({
    recordType: 'ActiveCaloriesBurned',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
  });
  return res.ACTIVE_CALORIES_TOTAL.inKilocalories > 0 ? Math.round(res.ACTIVE_CALORIES_TOTAL.inKilocalories) : null;
}

/** Busca treinos do Health Connect desde a data informada, mais recentes primeiro — mesma assinatura de fetchRecentWorkouts (healthkit.ts). */
export async function fetchRecentWorkouts(sinceDate: Date): Promise<HealthKitWorkout[]> {
  await ensureInitialized();
  const timeRangeFilter = { operator: 'between' as const, startTime: sinceDate.toISOString(), endTime: new Date().toISOString() };
  const records = await readAllPages('ExerciseSession', timeRangeFilter, false, 100);

  const results: HealthKitWorkout[] = [];
  for (const record of records) {
    const start = new Date(record.startTime);
    const end = new Date(record.endTime);
    const id = record.metadata?.id ?? `${record.startTime}-${record.endTime}`;

    const [caloriesBurned, routePoints] = await Promise.all([
      safe(aggregateActiveCaloriesForWindow(start, end)),
      safe(extractExerciseRoutePoints(record.exerciseRoute, record.metadata?.id)),
    ]);

    results.push({
      id,
      activityType: mapExerciseType(record.exerciseType),
      startedAt: record.startTime,
      finishedAt: record.endTime,
      durationSeconds: Math.round((end.getTime() - start.getTime()) / 1000),
      distanceMeters: null, // READ_DISTANCE nao pedido nesta etapa
      caloriesBurned,
      routePoints: routePoints ?? null,
      routeUnavailable: isExerciseRouteBlocked(record.exerciseRoute, routePoints ?? null),
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// Historico agregado (app/health/[metric].tsx) e resumo (Home) — agora com
// FC e Sono reais, alem de Passos/Calorias (Etapa 3).

/** Historico por periodo/offset das 4 metricas — todas com dado real agora (distancia continua fora do HealthMetricKey, nao muda aqui). */
export async function fetchHealthMetricHistory(
  metric: HealthMetricKey,
  period: HealthHistoryPeriod,
  offset = 0
): Promise<HealthMetricHistory> {
  await ensureInitialized();
  if (metric === 'steps' || metric === 'calories') {
    const recordType = METRIC_BY_KEY[metric];
    return buildHistory(period, offset, (start, end, granularity) => aggregateBuckets(recordType, start, end, granularity));
  }
  if (metric === 'heartRate') {
    return buildHistory(period, offset, (start, end, granularity) => aggregateHeartRateBuckets(start, end, granularity));
  }
  // 'sleep'
  return buildHistory(period, offset, (start, end, granularity) => aggregateSleepHistoryBuckets(start, end, granularity));
}

async function fetchHeartRateSummaryPart(since: Date): Promise<HealthSummary['heartRate']> {
  // "Mais recente" sem limite de idade fixo (equivale a getMostRecentQuantitySample
  // do HealthKit, que tambem nao tem esse limite) -- tenta 24h primeiro (caso
  // comum) e so alarga pra 7d se nao achar nada, em vez de uma busca sem
  // limite nenhum.
  let mostRecent: HeartRateSamplePoint | null = null;
  for (const lookbackDays of [1, 7]) {
    const samples = await readHeartRateSamplesInRange(daysAgo(lookbackDays), new Date());
    if (samples.length > 0) {
      mostRecent = samples[samples.length - 1];
      break;
    }
  }

  const avgRes = await safe(
    aggregateRecord({
      recordType: 'HeartRate',
      timeRangeFilter: { operator: 'between', startTime: since.toISOString(), endTime: new Date().toISOString() },
    })
  );

  return {
    mostRecentBpm: mostRecent ? mostRecent.bpm : null,
    mostRecentAt: mostRecent ? mostRecent.recordedAt : null,
    average7dBpm: avgRes && avgRes.BPM_AVG > 0 ? Math.round(avgRes.BPM_AVG) : null,
  };
}

const EMPTY_HEART_RATE: HealthSummary['heartRate'] = { mostRecentBpm: null, mostRecentAt: null, average7dBpm: null };

/**
 * Resumo do Health Connect. Passos, Calorias ativas, FC e Sono sao lidos de
 * verdade agora; distancia continua no padrao "sem dado" (null) — exigiria
 * READ_DISTANCE, nao pedido em nenhuma etapa ate agora. Mesmo shape que
 * healthkit.ts devolve, pra fachada e componentes nao precisarem saber a
 * plataforma.
 */
export async function fetchHealthSummary(): Promise<HealthSummary> {
  await ensureInitialized();
  const today = startOfToday();
  const sevenDaysAgo = daysAgo(7);

  // safeWithForegroundRetry (nao safe): este resumo roda no mount de
  // HealthMetricsGrid / HealthSummaryCard, durante a transicao de aba,
  // frequentemente antes do SO considerar o app em foreground -- ai o
  // aggregate/read do Health Connect lanca "must be in foreground" e o tile
  // fica em "--" so por timing. Re-tenta so nesse caso especifico. Cobre os
  // 4 grupos de tile de uma vez (Passos, Calorias, FC, Sono).
  const [stepsToday, steps7d, activeEnergyTodayKcal, activeEnergy7dKcal, heartRate, sleepLastNightHours] = await Promise.all([
    safeWithForegroundRetry(() => aggregateTotal('Steps', today)),
    safeWithForegroundRetry(() => aggregateTotal('Steps', sevenDaysAgo)),
    safeWithForegroundRetry(() => aggregateTotal('ActiveCaloriesBurned', today)),
    safeWithForegroundRetry(() => aggregateTotal('ActiveCaloriesBurned', sevenDaysAgo)),
    safeWithForegroundRetry(() => fetchHeartRateSummaryPart(sevenDaysAgo)),
    safeWithForegroundRetry(() => fetchLastNightSleepHours()),
  ]);

  return {
    stepsToday: stepsToday != null ? Math.round(stepsToday) : null,
    steps7d: steps7d != null ? Math.round(steps7d) : null,
    distanceTodayMeters: null,
    distance7dMeters: null,
    activeEnergyTodayKcal: activeEnergyTodayKcal != null ? Math.round(activeEnergyTodayKcal) : null,
    activeEnergy7dKcal: activeEnergy7dKcal != null ? Math.round(activeEnergy7dKcal) : null,
    heartRate: heartRate ?? EMPTY_HEART_RATE,
    sleepLastNightHours,
  };
}
