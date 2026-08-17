import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * Estado do wizard de cadastro (Conta -> Corpo -> Objetivo -> Frequencia ->
 * Nivel/Equipamento -> Meta calorica -> [Estimativa, condicional]),
 * guardado so em memoria (nunca persistido em disco) enquanto o usuario
 * navega pelos passos dentro do grupo (auth) — ainda nao autenticado,
 * entao nao ha "usuario logado" pra guardar isso em nenhum outro lugar.
 *
 * Onboarding expandido: campos novos abaixo alimentam calculos
 * (utils/healthCalculations.ts) e/ou sao persistidos no User via
 * updateProfile no passo final (ver finishRegistration em
 * services/onboarding.ts). targetBodyFatPercentage/targetWeight/
 * trainingFrequency/cardioFrequency NAO tem coluna propria no User —
 * usados so transitoriamente aqui pra calcular a meta calorica e a
 * estimativa de tempo, decisao documentada no relatorio da tarefa (o
 * pedido so listou 6 campos pra virar coluna nova, esses nao estavam
 * na lista).
 */
export type BiologicalSex = 'masculino' | 'feminino' | 'prefiro_nao_informar';

export interface RegisterDraft {
  name: string;
  email: string;
  password: string;
  weight: string;
  height: string;
  dateOfBirth: string; // 'YYYY-MM-DD'
  biologicalSex: BiologicalSex | null;
  bodyFatPercentage: string; // opcional
  goal: string | null;
  targetBodyFatPercentage: string; // opcional -- so usado se bodyFatPercentage foi informado
  targetWeight: string; // opcional -- fallback se bodyFatPercentage nao foi informado
  trainingFrequency: number | null; // sessoes de treino de forca / semana
  cardioFrequency: number | null; // sessoes de cardio / semana
  trainingLevel: string | null; // mesmos valores de workout-plan/generate.tsx
  equipment: string | null; // idem
  dailyCalorieGoal: string; // sugestao calculada, editavel pelo usuario antes de confirmar
}

const EMPTY_DRAFT: RegisterDraft = {
  name: '',
  email: '',
  password: '',
  weight: '',
  height: '',
  dateOfBirth: '',
  biologicalSex: null,
  bodyFatPercentage: '',
  goal: null,
  targetBodyFatPercentage: '',
  targetWeight: '',
  trainingFrequency: null,
  cardioFrequency: null,
  trainingLevel: null,
  equipment: null,
  dailyCalorieGoal: '',
};

interface RegisterDraftContextValue {
  draft: RegisterDraft;
  updateDraft: (patch: Partial<RegisterDraft>) => void;
}

const RegisterDraftContext = createContext<RegisterDraftContextValue | undefined>(undefined);

export function RegisterDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<RegisterDraft>(EMPTY_DRAFT);

  const updateDraft = (patch: Partial<RegisterDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const value = useMemo(() => ({ draft, updateDraft }), [draft]);

  return <RegisterDraftContext.Provider value={value}>{children}</RegisterDraftContext.Provider>;
}

export function useRegisterDraft(): RegisterDraftContextValue {
  const ctx = useContext(RegisterDraftContext);
  if (!ctx) throw new Error('useRegisterDraft precisa estar dentro de RegisterDraftProvider');
  return ctx;
}
