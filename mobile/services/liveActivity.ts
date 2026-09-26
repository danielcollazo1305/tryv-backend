import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

/**
 * Ponte pro modulo nativo Swift (mobile/TryvFitWidgets/Module.swift, Name
 * "TryvFitWidgets") que liga/atualiza/desliga a Live Activity (Dynamic
 * Island / tela de bloqueio) do treino livre em andamento -- so existe
 * quando o app foi buildado com o config plugin react-native-widget-
 * extension (ver app.json), entao SO tenta carregar em iOS. Nao usa o
 * wrapper JS exportado pelo pacote react-native-widget-extension (ele
 * assume um nome de modulo nativo fixo diferente, "ReactNativeWidgetExtension"
 * -- o nosso Module.swift registra "TryvFitWidgets", nome proprio, entao
 * carregamos direto por aqui em vez de depender do wrapper deles).
 *
 * `requireNativeModule` lanca excecao se o modulo nao existir de verdade
 * (build antigo sem esse plugin, ou algum problema de linking) -- o
 * try/catch aqui evita que isso derrube o app inteiro no boot (este
 * arquivo e importado bem cedo, por WorkoutSessionDraftContext.tsx).
 *
 * As 3 funcoes de start/update/end sao ASYNC de proposito (o lado Swift
 * usa AsyncFunction, nao Function+Task{} solto -- ver comentario em
 * Module.swift sobre o bug real que isso corrigiu). O CHAMADOR
 * (WorkoutSessionDraftContext.tsx) precisa dar await em cada uma antes da
 * proxima -- e exatamente isso que garante a ordem certa entre
 * end/start/update, sem depender de nenhuma garantia de concorrencia do
 * lado nativo.
 */

/** Mesmo shape de ExerciseSummary em Attributes.swift -- um exercicio do ponto de vista da Live Activity (nao o FreeSessionExerciseDraft inteiro, so o que a extensao precisa pra desenhar/navegar). */
export interface LiveActivityExerciseSummary {
  name: string;
  totalSets: number;
  /** Indice da primeira serie NAO concluida deste exercicio, -1 se todas ja estao concluidas. */
  firstIncompleteSetIndex: number;
}

/** Mesmo shape do ContentState em Attributes.swift. `autoExerciseIndex` e sempre o "exercicio automatico" (primeiro com serie pendente) calculado aqui -- a Live Activity pode estar mostrando outro, se a pessoa navegou manualmente com os botoes de anterior/proximo (ver Attributes.swift), mas todo start/updateActivity "reseta" essa navegacao de volta pro automatico. */
export interface LiveActivityContentState {
  exercises: LiveActivityExerciseSummary[];
  autoExerciseIndex: number;
}

/** Uma serie marcada como feita pelo botao da Live Activity, ainda nao aplicada no draft (ver readPendingSetUpdates). */
export interface PendingSetUpdate {
  exerciseName: string;
  setIndex: number;
}

interface TryvFitWidgetsNativeModule {
  areActivitiesEnabled(): Promise<boolean>;
  startActivity(
    startedAtMs: number,
    exercises: LiveActivityExerciseSummary[],
    autoExerciseIndex: number
  ): Promise<void>;
  updateActivity(exercises: LiveActivityExerciseSummary[], autoExerciseIndex: number): Promise<void>;
  endActivity(): Promise<void>;
  readPendingSetUpdates(): Promise<PendingSetUpdate[]>;
}

let nativeModule: TryvFitWidgetsNativeModule | null = null;
if (Platform.OS === 'ios') {
  try {
    nativeModule = requireNativeModule<TryvFitWidgetsNativeModule>('TryvFitWidgets');
  } catch (error) {
    console.error('[liveActivity] modulo nativo TryvFitWidgets nao encontrado', error);
  }
}

/** Inicia a Live Activity do treino livre -- startedAtMs em epoch ms, mesmo formato de WorkoutSessionDraft.startedAt. */
export async function startFreeWorkoutLiveActivity(startedAtMs: number, state: LiveActivityContentState): Promise<void> {
  try {
    await nativeModule?.startActivity(startedAtMs, state.exercises, state.autoExerciseIndex);
  } catch (error) {
    console.error('[liveActivity] falha ao iniciar Live Activity', error);
  }
}

/** startedAt nao muda depois de iniciada -- e fixo (parte de ActivityAttributes, nao de ContentState). */
export async function updateFreeWorkoutLiveActivity(state: LiveActivityContentState): Promise<void> {
  try {
    await nativeModule?.updateActivity(state.exercises, state.autoExerciseIndex);
  } catch (error) {
    console.error('[liveActivity] falha ao atualizar Live Activity', error);
  }
}

export async function endFreeWorkoutLiveActivity(): Promise<void> {
  try {
    await nativeModule?.endActivity();
  } catch (error) {
    console.error('[liveActivity] falha ao encerrar Live Activity', error);
  }
}

/**
 * Le (e limpa, do lado nativo) as series marcadas pelo botao da Live
 * Activity desde a ultima leitura -- MarkCurrentSetDoneIntent
 * (Attributes.swift) empilha uma entrada por toque num UserDefaults
 * compartilhado (App Group) enquanto o app estava fechado/minimizado;
 * aqui e onde o app consome essa fila. Retorna [] (sem erro) se o modulo
 * nativo nao existir ou a chamada falhar -- chamador nao precisa de
 * try/catch proprio pra isso.
 */
export async function readPendingSetUpdates(): Promise<PendingSetUpdate[]> {
  try {
    return (await nativeModule?.readPendingSetUpdates()) ?? [];
  } catch (error) {
    console.error('[liveActivity] falha ao ler toques pendentes da Live Activity', error);
    return [];
  }
}
