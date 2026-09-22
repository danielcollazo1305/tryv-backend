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

/** Mesmo shape do ContentState em Attributes.swift -- ver comentario la sobre o que "serie atual" significa (primeira serie NAO concluida, nao o que esta na tela do carrossel). */
export interface LiveActivityContentState {
  exerciseCount: number;
  currentExerciseName: string;
  currentSetIndex: number;
  currentExerciseTotalSets: number;
  allSetsCompleted: boolean;
}

interface TryvFitWidgetsNativeModule {
  areActivitiesEnabled(): Promise<boolean>;
  startActivity(
    startedAtMs: number,
    exerciseCount: number,
    currentExerciseName: string,
    currentSetIndex: number,
    currentExerciseTotalSets: number,
    allSetsCompleted: boolean
  ): Promise<void>;
  updateActivity(
    exerciseCount: number,
    currentExerciseName: string,
    currentSetIndex: number,
    currentExerciseTotalSets: number,
    allSetsCompleted: boolean
  ): Promise<void>;
  endActivity(): Promise<void>;
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
    await nativeModule?.startActivity(
      startedAtMs,
      state.exerciseCount,
      state.currentExerciseName,
      state.currentSetIndex,
      state.currentExerciseTotalSets,
      state.allSetsCompleted
    );
  } catch (error) {
    console.error('[liveActivity] falha ao iniciar Live Activity', error);
  }
}

/** startedAt nao muda depois de iniciada -- e fixo (parte de ActivityAttributes, nao de ContentState). */
export async function updateFreeWorkoutLiveActivity(state: LiveActivityContentState): Promise<void> {
  try {
    await nativeModule?.updateActivity(
      state.exerciseCount,
      state.currentExerciseName,
      state.currentSetIndex,
      state.currentExerciseTotalSets,
      state.allSetsCompleted
    );
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
