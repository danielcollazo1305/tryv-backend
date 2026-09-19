import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SetEntry } from '@/components/WorkoutDayCard';

/**
 * So o rascunho de sessao LIVRE e persistido em disco (ver "MIGRACAO
 * PARCIAL" abaixo — mode:'plan' nao passa por este Context hoje). Chave
 * versionada (v1) pra permitir invalidar rascunhos antigos com formato
 * incompativel numa mudanca futura, sem precisar de migracao de dado.
 */
const FREE_DRAFT_STORAGE_KEY = 'workout-session-draft-free-v1';

/** Espera ficar quieto antes de gravar — evita um write no disco a cada tecla digitada em peso/reps. */
const PERSIST_DEBOUNCE_MS = 500;

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
 * zustand/redux). O rascunho de sessao LIVRE tambem sobrevive o app sendo
 * fechado pelo sistema (comum numa sessao de 40-60min com a tela bloqueada
 * entre series) — gravado em AsyncStorage a cada mudanca (debounced) e
 * restaurado ao montar o Provider; ver os 2 useEffect de hidratacao/
 * persistencia logo abaixo. Montado no RootLayout (app/_layout.tsx), acima
 * de toda a navegacao autenticada — nao so da aba Treino — pra sobreviver
 * tambem a trocar de aba (Home <-> Treino), nao so a navegacao dentro da
 * mesma aba.
 *
 * MIGRACAO PARCIAL (deliberada): so o fluxo de sessao LIVRE
 * (FreeWorkoutLogView.tsx) de fato le/escreve por este Context nesta
 * tarefa (e, por isso, so ele e persistido em disco — ver
 * FREE_DRAFT_STORAGE_KEY acima). O fluxo de PLANO (WorkoutPlanView.tsx/
 * logByDay) continua com seu useState local por enquanto — migrar ele
 * tambem exigiria mexer num fluxo ja funcionando (plano ja salvo + registro
 * + compartilhamento) sem um bug concreto motivando agora.
 * `WorkoutSessionDraft` ja nasce cobrindo os 2 modos (`mode: 'plan' |
 * 'free'`) pra essa migracao futura ser so trocar useState por este
 * Context, sem redesenhar o formato do dado.
 */
export function WorkoutSessionDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<WorkoutSessionDraft | null>(null);
  // Trava a gravacao ate o disco ter sido lido pelo menos uma vez — sem
  // isso, o efeito de persistencia dispararia no primeiro render (com
  // draft ainda null, antes da leitura assincrona terminar) e apagaria um
  // rascunho salvo numa sessao anterior antes mesmo dele ser restaurado.
  const [hydrated, setHydrated] = useState(false);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FREE_DRAFT_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as WorkoutSessionDraft;
        if (parsed?.mode === 'free') setDraft(parsed);
      })
      .catch(() => {
        // Rascunho corrompido/ilegivel -- ignora e comeca vazio, igual a
        // nunca ter havido nada salvo (nao ha como recuperar dado invalido).
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      const write =
        draft?.mode === 'free'
          ? AsyncStorage.setItem(FREE_DRAFT_STORAGE_KEY, JSON.stringify(draft))
          : AsyncStorage.removeItem(FREE_DRAFT_STORAGE_KEY);
      write.catch(() => {
        // Falha de escrita em disco nao deve travar o fluxo em memoria --
        // o usuario so perde a sobrevivencia a fechar o app nesta sessao.
      });
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [draft, hydrated]);

  const value = useMemo(() => ({ draft, setDraft }), [draft]);
  return <WorkoutSessionDraftContext.Provider value={value}>{children}</WorkoutSessionDraftContext.Provider>;
}

export function useWorkoutSessionDraft(): WorkoutSessionDraftContextValue {
  const ctx = useContext(WorkoutSessionDraftContext);
  if (!ctx) throw new Error('useWorkoutSessionDraft precisa estar dentro de WorkoutSessionDraftProvider');
  return ctx;
}
