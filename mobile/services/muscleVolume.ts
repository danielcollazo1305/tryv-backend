import { getExerciseInfo } from '@/constants/exerciseLibrary';
import { api } from '@/services/api';
import {
  MuscleVolumeResult,
  PeriodDays,
  buildMuscleVolume,
  normalizeExerciseVolume,
  periodWindow,
} from '@/services/muscleVolumeState';

/**
 * Series CONCLUIDAS por exercicio nos ultimos `days` dias (GET /dashboard/exercise-volume, so do usuario logado). A janela e em dias LOCAIS do
 * aparelho, terminando hoje (mesma conta de data local das outras telas). Resposta fora do formato = erro (a tela mostra "Tentar de novo").
 */
export async function getExerciseVolume(days: PeriodDays) {
  const { start_date, end_date } = periodWindow(days);
  const response = await api.get<unknown>('/dashboard/exercise-volume', { params: { start_date, end_date } });
  const data = normalizeExerciseVolume(response.data);
  if (!data) throw new Error('Resposta inesperada do volume por exercicio');
  return data;
}

/** Volume por musculo no periodo: busca o volume por exercicio e converte pela biblioteca de exercicios do app. */
export async function getMuscleVolume(days: PeriodDays): Promise<MuscleVolumeResult> {
  const data = await getExerciseVolume(days);
  return buildMuscleVolume(data, (name) => getExerciseInfo(name)?.muscles ?? null);
}
