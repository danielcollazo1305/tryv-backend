import React, { createContext, useContext, useMemo, useState } from 'react';

import { SetEntry } from '@/components/WorkoutDayCard';

/**
 * Exercicio dentro de uma sessao LIVRE em andamento — mesmo formato de
 * FreeSessionExercise (FreeWorkoutLogView.tsx), definido aqui de proposito:
 * o Context nao deve importar de um componente de tela; e o componente que
 * importa este tipo, nao o contrario.
 */
export interface FreeSessionExerciseDraft {
  name: string;
  sets: SetEntry[];
}

/**
 * Estado de UMA sessao de treino em andamento — unificado desde o inicio
 * pros 2 modos (plano/livre), mesmo sem os dois ja estarem "plugados" no
 * Context nesta tarefa (ver comentario em WorkoutSessionDraftProvider
 * abaixo sobre o que foi migrado agora vs fica pra depois).
 */
export type WorkoutSessionDraft =
  | { mode: 'plan'; planId: string; dayIndex: number; logByDay: Record<number, Record<number, SetEntry[]>> }
  | { mode: 'free'; exercises: FreeSessionExerciseDraft[] };

interface WorkoutSessionDraftContextValue {
  draft: WorkoutSessionDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<WorkoutSessionDraft | null>>;
}

const WorkoutSessionDraftContext = createContext<WorkoutSessionDraftContextValue | undefined>(undefined);

/**
 * Guarda o registro de treino em andamento (series/peso/reps ainda nao
 * salvas) acima do nivel de navegacao — sobrevive a trocar de aba, abrir
 * outra tela e voltar, etc, ao contrario de um useState local (que reseta
 * se a tela desmontar). Mesmo precedente de RegisterDraftContext.tsx
 * (unico padrao de state management ja usado neste projeto pra isso — sem
 * zustand/redux). Nunca persistido em disco (some ao fechar o app), igual
 * o draft de cadastro. Montado no RootLayout (app/_layout.tsx), acima de
 * toda a navegacao autenticada — nao so da aba Treino — pra sobreviver
 * tambem a trocar de aba (Home <-> Treino), nao so a navegacao dentro da
 * mesma aba.
 *
 * MIGRACAO PARCIAL (deliberada): so o fluxo de sessao LIVRE
 * (FreeWorkoutLogView.tsx) de fato le/escreve por este Context nesta
 * tarefa. O fluxo de PLANO (WorkoutPlanView.tsx/logByDay) continua com seu
 * useState local por enquanto — migrar ele tambem exigiria mexer num fluxo
 * ja funcionando (plano ja salvo + registro + compartilhamento) sem um bug
 * concreto motivando agora. `WorkoutSessionDraft` ja nasce cobrindo os 2
 * modos (`mode: 'plan' | 'free'`) pra essa migracao futura ser so trocar
 * useState por este Context, sem redesenhar o formato do dado.
 */
export function WorkoutSessionDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<WorkoutSessionDraft | null>(null);
  const value = useMemo(() => ({ draft, setDraft }), [draft]);
  return <WorkoutSessionDraftContext.Provider value={value}>{children}</WorkoutSessionDraftContext.Provider>;
}

export function useWorkoutSessionDraft(): WorkoutSessionDraftContextValue {
  const ctx = useContext(WorkoutSessionDraftContext);
  if (!ctx) throw new Error('useWorkoutSessionDraft precisa estar dentro de WorkoutSessionDraftProvider');
  return ctx;
}
