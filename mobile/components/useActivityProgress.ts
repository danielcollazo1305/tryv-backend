import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getApiErrorMessage } from '@/services/api';
import { ProgressPeriod, RunProgress, WorkoutProgress, getRunProgress, getWorkoutProgress } from '@/services/dashboard';
import { colors3 } from '@/constants/theme';

export type ActivityProgressTab = 'run' | 'workout';

export const TAB_OPTIONS: { value: ActivityProgressTab; label: string }[] = [
  { value: 'run', label: 'Corrida' },
  { value: 'workout', label: 'Musculação' },
];

export const PERIOD_OPTIONS: { value: ProgressPeriod; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

/**
 * Cor de cada aba quando selecionada — "Corrida" usa o par ambar
 * tertiary-fixed-dim/on-tertiary-fixed do HTML de origem
 * (bg-[#ffb869]/text-[#2c1700], hardcoded la tambem em vez das chaves
 * tertiary-*, mas sao os mesmos tons — ver colors3 em constants/theme.ts),
 * "Musculacao" usa o roxo primario padrao do app.
 */
export const TAB_COLOR: Record<ActivityProgressTab, { bg: string; text: string }> = {
  run: { bg: colors3.tertiaryFixedDim, text: colors3.onTertiaryFixed },
  workout: { bg: colors3.primary, text: colors3.onPrimary },
};

export function formatDistance(km: number): string {
  return km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Janela de dias de cada periodo — identica ao backend
 * (dashboard.py:_compute_run_chart/_compute_workout_chart): semanal = 7
 * dias corridos, mensal = 12 semanas (84 dias). Exportado pra quem precisar
 * montar uma lista de atividades cobrindo a MESMA janela que o grafico
 * mostra (ver app/activity/progress.tsx) — nao inventar um corte diferente.
 */
export const PERIOD_DAYS: Record<ProgressPeriod, number> = {
  weekly: 7,
  monthly: 84,
};

export interface UseActivityProgressResult {
  tab: ActivityProgressTab;
  setTab: (tab: ActivityProgressTab) => void;
  period: ProgressPeriod;
  setPeriod: (period: ProgressPeriod) => void;
  runProgress: RunProgress | null;
  workoutProgress: WorkoutProgress | null;
  /** runProgress ou workoutProgress conforme a aba ativa — atalho ja usado nos dois consumidores. */
  progress: RunProgress | WorkoutProgress | null;
  errorMessage: string | null;
  reload: () => void;
}

/**
 * Estado + fetch (getRunProgress/getWorkoutProgress) do progresso de
 * atividade (Corrida/Musculacao, toggle Semanal/Mensal) — extraido do
 * antigo ActivityProgressCard.tsx nesta tarefa pra ser compartilhado entre
 * o card compacto da Home e a pagina cheia (app/activity/progress.tsx), sem
 * duplicar fetch/estado entre os dois. Recarrega no foco (useFocusEffect) —
 * cada consumidor decide sozinho onde/como renderizar o resultado.
 */
export function useActivityProgress(): UseActivityProgressResult {
  const [tab, setTab] = useState<ActivityProgressTab>('run');
  const [period, setPeriod] = useState<ProgressPeriod>('weekly');
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [workoutProgress, setWorkoutProgress] = useState<WorkoutProgress | null>(null);
  // Mensagem real do erro (nao so um boolean) — mesma convencao usada no
  // resto do app (getApiErrorMessage) pra distinguir 404/500/rede em vez
  // de um "nao foi possivel" generico que esconde a causa.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    try {
      if (tab === 'run') {
        setRunProgress(await getRunProgress(period));
      } else {
        setWorkoutProgress(await getWorkoutProgress(period));
      }
    } catch (err) {
      console.error('useActivityProgress: falha ao buscar progresso', err);
      setErrorMessage(getApiErrorMessage(err, 'Não foi possível carregar seu progresso.'));
    }
  }, [tab, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const progress = tab === 'run' ? runProgress : workoutProgress;

  return { tab, setTab, period, setPeriod, runProgress, workoutProgress, progress, errorMessage, reload: load };
}
