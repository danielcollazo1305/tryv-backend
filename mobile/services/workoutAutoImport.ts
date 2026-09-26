import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  createManualActivityFromImport,
  createRunFromImport,
  ExternalActivitySource,
  listManualActivities,
  listRuns,
  ManualActivity,
  parseUtcDate,
  Run,
} from '@/services/activities';
import { ensureAuthToken } from '@/services/api';
import { fetchWorkoutsSinceAnchor, HealthKitWorkout, isHealthAuthorizedWithoutPrompting } from '@/services/health';

/**
 * Importacao de treinos do hub de saude do celular (Apple Health / Health
 * Connect) SEM React: a logica morava dentro de app/activity/healthkit.tsx
 * (componente, com useState/useRef), e um gatilho automatico — que pode rodar
 * com o app em segundo plano, sem tela nenhuma montada — nao tem como chamar
 * um componente.
 *
 * Quem usa isto:
 *   - a tela manual de importacao (botao "Importar"), via importWorkout;
 *   - os gatilhos automaticos, via runAutoImport.
 * Os dois passam pela MESMA trava (ver `inFlight`), entao nunca ha duas
 * importacoes ao mesmo tempo dentro do app.
 *
 * A protecao de verdade contra treino duplicado, porem, nao e essa trava (ela
 * so vale dentro de um processo): e o par external_source/external_id enviado
 * ao backend, que tem indice unico parcial sobre ele. Ver
 * backend/app/models/run.py.
 */

/** Bundle id / package name do proprio app — treinos com esta origem sao ignorados (ver OWN_SOURCE_IDS). */
const OWN_BUNDLE_ID = 'com.danielcollazo.tryvmobile';

/**
 * Origens que representam o proprio Tryv Fit escrevendo no hub de saude. O app
 * ja grava ExerciseSession no Health Connect (services/healthConnect.ts) e
 * pode passar a gravar no Apple Health no futuro — sem este filtro, a
 * importacao automatica leria de volta o que ele mesmo escreveu e criaria um
 * ciclo de reimportacao.
 */
const OWN_SOURCE_IDS = new Set<string>([OWN_BUNDLE_ID]);

/** Quantos dias olhar pra tras quando NAO ha anchor salvo (primeira execucao). O historico mais antigo continua disponivel na tela de importacao manual. */
const FIRST_RUN_LOOKBACK_DAYS = 7;

/** Mesma tolerancia da checagem por horario que ja existia na tela manual — cobre a variacao entre o inicio registrado pelo relogio e o que foi salvo aqui. */
const DUPLICATE_TOLERANCE_MS = 5 * 60 * 1000;

/** Anchor da consulta ancorada do HealthKit (iOS). Nunca usado no Android — ver fetchWorkoutsSinceAnchor em healthConnect.ts. */
const ANCHOR_KEY = 'workout_auto_import_anchor_v1';
/** Diagnostico da ultima execucao — existe pra dar pra investigar no aparelho real, sem Xcode. */
const LAST_RUN_KEY = 'workout_auto_import_last_run_v1';
/** Ligado/desligado pelo usuario nas configuracoes. Ausente = ligado. */
const ENABLED_KEY = 'workout_auto_import_enabled_v1';

export type AutoImportTrigger = 'foreground' | 'background';

export interface AutoImportResult {
  imported: number;
  skippedDuplicates: number;
  skippedOwnSource: number;
  /** true quando algum treino entrou como atividade manual por nao ter sido possivel ler a rota GPS (so Android — ver routeUnavailable). */
  routeSkipped: boolean;
  error?: string;
}

const EMPTY_RESULT: AutoImportResult = {
  imported: 0,
  skippedDuplicates: 0,
  skippedOwnSource: 0,
  routeSkipped: false,
};

/** Fonte externa correspondente a plataforma atual — valor gravado em external_source no backend. */
function currentSource(): ExternalActivitySource {
  return Platform.OS === 'ios' ? 'apple_health' : 'health_connect';
}

// Trava de modulo: uma unica importacao por vez no app inteiro. A tela manual
// espera a vez (o usuario pediu aquilo explicitamente, engolir o toque seria
// pior); o gatilho automatico desiste na hora (ver runAutoImport) — ele roda
// de novo sozinho na proxima vez.
let inFlight: Promise<unknown> | null = null;

async function withImportLock<T>(task: () => Promise<T>): Promise<T> {
  while (inFlight) {
    // `catch` aqui e so pra nao herdar a rejeicao da tarefa anterior: se ela
    // falhou, o problema e dela, nao desta.
    await inFlight.catch(() => undefined);
  }
  const promise = task();
  inFlight = promise;
  try {
    return await promise;
  } finally {
    if (inFlight === promise) inFlight = null;
  }
}

/**
 * Importa UM treino: vira corrida (com rota de GPS) ou atividade manual (sem
 * rota) — exatamente o mesmo criterio que a tela manual ja usava. Devolve
 * 'duplicate' quando o backend reconheceu o treino como ja importado
 * (external_id repetido) e devolveu o registro existente em vez de criar
 * outro; nesse caso nada foi criado.
 */
export async function importWorkout(workout: HealthKitWorkout): Promise<'created' | 'duplicate'> {
  return withImportLock(() => importWorkoutUnlocked(workout, currentSource()));
}

/** Ligado por padrao — a chave so existe depois que o usuario mexeu no toggle. */
export async function isAutoImportEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) !== 'false';
  } catch {
    return true;
  }
}

export async function setAutoImportEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // Falha de escrita nao deve quebrar a tela de configuracoes — o usuario
    // so vai encontrar o toggle no estado anterior na proxima abertura.
  }
}

/** Ja existe no Tryv um registro com este external_id, ou muito proximo no horario? */
function isAlreadyImported(
  workout: HealthKitWorkout,
  source: ExternalActivitySource,
  runs: Run[],
  manualActivities: ManualActivity[]
): boolean {
  const matchesExternalId = (candidate: { external_source?: string | null; external_id?: string | null }) =>
    candidate.external_source === source && candidate.external_id === workout.id;
  if (runs.some(matchesExternalId) || manualActivities.some(matchesExternalId)) return true;

  // Segunda camada, pros treinos importados ANTES de external_id existir
  // (external_id NULL no banco): proximidade de horario, mesmo criterio que a
  // tela manual sempre usou.
  const workoutStart = parseUtcDate(workout.startedAt).getTime();
  const withinTolerance = (isoDate: string) =>
    Math.abs(parseUtcDate(isoDate).getTime() - workoutStart) < DUPLICATE_TOLERANCE_MS;
  return (
    runs.some((run) => withinTolerance(run.started_at)) ||
    manualActivities.some((activity) => withinTolerance(activity.performed_at))
  );
}

async function persistLastRun(trigger: AutoImportTrigger, result: AutoImportResult): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LAST_RUN_KEY,
      JSON.stringify({ lastRunAt: new Date().toISOString(), trigger, lastResult: result })
    );
  } catch {
    // Diagnostico e melhor-esforco — nunca deve derrubar a importacao.
  }
}

/** Ultima execucao registrada (diagnostico) — null se nunca rodou ou se o registro estiver ilegivel. */
export async function readLastAutoImportRun(): Promise<
  { lastRunAt: string; trigger: AutoImportTrigger; lastResult: AutoImportResult } | null
> {
  try {
    const raw = await AsyncStorage.getItem(LAST_RUN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Gatilho automatico: busca o que e novo no hub de saude, filtra e importa.
 *
 * Sai em SILENCIO (resultado zerado, sem erro) em toda condicao que nao e
 * problema: plataforma sem hub de saude, toggle desligado, permissao nao
 * concedida, usuario deslogado, outra importacao em andamento. Nada disso
 * merece alarme — sao estados normais.
 *
 * NUNCA abre o dialogo de permissao: quem roda isto e o sistema/app, nao o
 * usuario (ver isHealthAuthorizedWithoutPrompting).
 */
export async function runAutoImport(trigger: AutoImportTrigger): Promise<AutoImportResult> {
  try {
    return await runAutoImportUnsafe(trigger);
  } catch (error) {
    // Rede de seguranca pro chamador em segundo plano (AppState/app/_layout.tsx),
    // que dispara isto "fire-and-forget" sem await/catch proprio -- runAutoImportUnsafe
    // ja trata os erros esperados da importacao em si (ver try/catch la dentro),
    // mas as checagens ANTES dela (isAutoImportEnabled/isHealthAuthorizedWithoutPrompting/
    // ensureAuthToken) chamam modulo nativo e podiam rejeitar sem isso, virando
    // unhandled promise rejection -- exatamente o que a Fase B pede pra nunca
    // acontecer (erro sempre silencioso pro usuario, so logado).
    console.error(`[autoImport] ${trigger}: erro inesperado`, error);
    return { ...EMPTY_RESULT, error: error instanceof Error ? error.message : 'erro desconhecido' };
  }
}

async function runAutoImportUnsafe(trigger: AutoImportTrigger): Promise<AutoImportResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return EMPTY_RESULT;
  if (inFlight) {
    // Ja ha uma importacao rodando (a tela manual, ou outro disparo). Desistir
    // e melhor que enfileirar: o gatilho automatico roda de novo sozinho, e em
    // segundo plano o tempo de execucao e curto demais pra ficar esperando.
    console.log(`[autoImport] ${trigger}: pulado, ja ha uma importacao em andamento`);
    return EMPTY_RESULT;
  }
  if (!(await isAutoImportEnabled())) return EMPTY_RESULT;
  if (!(await isHealthAuthorizedWithoutPrompting())) return EMPTY_RESULT;
  // Sem sessao salva (deslogado) nao ha pra onde importar. Precisa vir ANTES
  // de qualquer chamada de API: em segundo plano o AuthContext pode nunca ter
  // montado, e as chamadas sairiam sem Authorization.
  if (!(await ensureAuthToken())) return EMPTY_RESULT;

  return withImportLock(async () => {
    const source = currentSource();
    const result: AutoImportResult = { ...EMPTY_RESULT };

    try {
      const anchor = await AsyncStorage.getItem(ANCHOR_KEY);
      const fallbackSince = new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const { workouts, newAnchor } = await fetchWorkoutsSinceAnchor(anchor, fallbackSince);

      const candidates = workouts.filter((workout) => {
        if (workout.sourceId && OWN_SOURCE_IDS.has(workout.sourceId)) {
          result.skippedOwnSource += 1;
          return false;
        }
        return true;
      });

      if (candidates.length === 0) {
        // Nada novo: nem vale as 2 chamadas de API pra montar a lista do que
        // ja existe. O anchor ainda avanca — nao ha nada pendente pra reter.
        if (newAnchor) await AsyncStorage.setItem(ANCHOR_KEY, newAnchor);
        await persistLastRun(trigger, result);
        console.log(`[autoImport] ${trigger}: nenhum treino novo`, result);
        return result;
      }

      const [runs, manualActivities] = await Promise.all([listRuns(), listManualActivities()]);

      for (const workout of candidates) {
        if (isAlreadyImported(workout, source, runs, manualActivities)) {
          result.skippedDuplicates += 1;
          continue;
        }
        const outcome = await importWorkoutUnlocked(workout, source);
        if (outcome === 'created') {
          result.imported += 1;
          if (!workout.routePoints?.length && workout.routeUnavailable) result.routeSkipped = true;
        } else {
          result.skippedDuplicates += 1;
        }
      }

      // Anchor so avanca DEPOIS que o lote inteiro entrou. Se algo falhar no
      // meio, o anchor antigo fica e o proximo disparo tenta de novo — o que
      // ja entrou nao duplica, porque o backend e idempotente por external_id.
      if (newAnchor) await AsyncStorage.setItem(ANCHOR_KEY, newAnchor);
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'erro desconhecido';
    }

    await persistLastRun(trigger, result);
    console.log(`[autoImport] ${trigger}:`, result);
    return result;
  });
}

/**
 * Corpo de importWorkout SEM a trava — usado dentro de runAutoImport, que ja
 * esta segurando a trava. Chamar importWorkout ali daria deadlock (ela
 * esperaria a propria execucao que a contem terminar).
 */
async function importWorkoutUnlocked(
  workout: HealthKitWorkout,
  source: ExternalActivitySource
): Promise<'created' | 'duplicate'> {
  const external = { external_source: source, external_id: workout.id };

  if (workout.routePoints && workout.routePoints.length > 0) {
    const { created } = await createRunFromImport({
      activity_type: workout.activityType,
      route_points: workout.routePoints,
      started_at: workout.startedAt,
      finished_at: workout.finishedAt,
      ...external,
    });
    return created ? 'created' : 'duplicate';
  }

  const { created } = await createManualActivityFromImport({
    activity_type: workout.activityType,
    duration_minutes: Math.max(1, Math.round(workout.durationSeconds / 60)),
    calories_burned: workout.caloriesBurned,
    performed_at: workout.startedAt,
    ...external,
  });
  return created ? 'created' : 'duplicate';
}
