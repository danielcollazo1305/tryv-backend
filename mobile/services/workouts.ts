import { api } from '@/services/api';
import { parseUtcDate } from '@/services/activities';

export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes: string;
  /** Video de execucao — so existe em exercicios de planos source='trainer' (o profissional anexa ao montar o plano). Nunca vem de IA. */
  video_url?: string | null;
}

export interface WorkoutDay {
  day: string;
  // 0=domingo...6=sabado — Date.getDay() nativo do JS, nao ISO (ver
  // comentario em backend/app/services/workout_generator.py._DAY_SCHEMA).
  // Opcional: planos gerados antes desse campo existir nao tem essa chave
  // (plan_data e JSON solto, sem migration pra backfill).
  day_of_week?: number | null;
  focus: string;
  exercises: WorkoutExercise[];
  estimated_duration_minutes?: number | null;
  estimated_calories?: number | null;
}

export interface WorkoutPlanData {
  summary: string;
  days: WorkoutDay[];
}

export interface WorkoutPlan {
  id: string;
  user_id: string;
  source: string;
  trainer_id: string | null;
  status: string;
  plan_data: WorkoutPlanData | null;
  /** null = nunca expira (hoje so acontece com planos source='trainer'). */
  expires_at: string | null;
  created_at: string;
}

/** Validade de 8 semanas pra planos gerados por IA (calculada no backend ao salvar). Planos source='trainer' tem expires_at nulo e nunca expiram por aqui. */
export function isWorkoutPlanExpired(plan: WorkoutPlan): boolean {
  if (!plan.expires_at) return false;
  return parseUtcDate(plan.expires_at).getTime() <= Date.now();
}

export interface TodayWorkoutResult {
  day: WorkoutDay;
  isToday: boolean;
}

/**
 * Acha o dia do plano que bate com hoje (day_of_week === Date.getDay()) —
 * ou, se hoje for dia de descanso, o proximo day_of_week futuro mais
 * proximo (rotacionando pra semana seguinte se nenhum dia do plano cair
 * mais adiante nesta semana). Retorna null se o plano nao tiver
 * plan_data, ou se NENHUM dia tiver day_of_week definido (planos gerados
 * antes desse campo existir) — nesse caso nao ha como saber com confianca
 * qual e "o treino de hoje", entao o chamador nao deve mostrar nada em vez
 * de adivinhar. Usado por TodayWorkoutCard.tsx (hero "Começar treino" da
 * Home).
 */
export function getTodayOrNextWorkoutDay(plan: WorkoutPlan): TodayWorkoutResult | null {
  const days = plan.plan_data?.days ?? [];
  const withDayOfWeek = days.filter((d): d is WorkoutDay & { day_of_week: number } => d.day_of_week != null);
  if (withDayOfWeek.length === 0) return null;

  const todayDow = new Date().getDay();
  const today = withDayOfWeek.find((d) => d.day_of_week === todayDow);
  if (today) return { day: today, isToday: true };

  const sortedByDow = [...withDayOfWeek].sort((a, b) => a.day_of_week - b.day_of_week);
  const next = sortedByDow.find((d) => d.day_of_week > todayDow) ?? sortedByDow[0];
  return { day: next, isToday: false };
}

/** null quando o plano nao tem validade (expires_at nulo) ou ja expirou. */
export function daysUntilWorkoutPlanExpiration(plan: WorkoutPlan): number | null {
  if (!plan.expires_at) return null;
  const diffMs = parseUtcDate(plan.expires_at).getTime() - Date.now();
  if (diffMs <= 0) return null;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export interface WorkoutGenerateRequest {
  goal: string;
  level: string;
  days_per_week: number;
  equipment: string;
  notes?: string | null;
}

/** Gera um plano via IA — nao salva nada ainda. */
export async function generateWorkoutPlan(payload: WorkoutGenerateRequest): Promise<WorkoutPlanData> {
  // Mesma folga de timeout usada na analise de refeicao — o backend usa
  // "thinking" e pode demorar bem mais que o padrao.
  const response = await api.post<WorkoutPlanData>('/workout-plans/generate', payload, { timeout: 45000 });
  return response.data;
}

export async function saveWorkoutPlan(planData: WorkoutPlanData): Promise<WorkoutPlan> {
  const response = await api.post<WorkoutPlan>('/workout-plans/', { plan_data: planData, source: 'ai' });
  return response.data;
}

/** Mais recente primeiro — o item [0] e tratado como o plano "ativo" atual. */
export async function listWorkoutPlans(): Promise<WorkoutPlan[]> {
  const response = await api.get<WorkoutPlan[]>('/workout-plans/');
  return response.data;
}

/**
 * Personal trainer monta um plano manual (sem IA) pra um aluno especifico
 * — preenche a lacuna que deixava TrainerWorkoutSection sempre no estado
 * vazio. Reaproveita o mesmo formato de WorkoutPlanData dos planos de IA.
 */
export async function createStudentWorkoutPlan(studentId: string, planData: WorkoutPlanData): Promise<WorkoutPlan> {
  const response = await api.post<WorkoutPlan>(`/trainers/students/${studentId}/workout-plans`, planData);
  return response.data;
}

export interface WorkoutSetLog {
  weight_kg: number | null;
  reps: number | null;
  completed: boolean;
}

export interface WorkoutExerciseLog {
  name: string;
  planned_sets: number;
  planned_reps: string;
  sets: WorkoutSetLog[];
}

export interface WorkoutSessionCreate {
  /** So usado por logFreeWorkoutSession (POST /workout-sessions) — em logWorkoutSession o plano vem da URL, este campo e ignorado. */
  plan_id?: string | null;
  /** Obrigatorio numa sessao de plano; None numa sessao livre (ver FreeSessionState). */
  day?: string | null;
  focus?: string | null;
  exercises: WorkoutExerciseLog[];
  duration_minutes?: number | null;
  calories_burned?: number | null;
}

export interface WorkoutSession {
  id: string;
  /** null numa sessao livre (sem plano associado). */
  plan_id: string | null;
  user_id: string;
  exercises: { day: string | null; focus: string | null; exercises: WorkoutExerciseLog[] } | null;
  calories_burned: number | null;
  duration_minutes: number | null;
  completed_at: string;
}

/** Registra o que foi de fato executado num dia do plano (peso/reps por serie). */
export async function logWorkoutSession(planId: string, payload: WorkoutSessionCreate): Promise<WorkoutSession> {
  const response = await api.post<WorkoutSession>(`/workout-plans/${planId}/sessions`, payload);
  return response.data;
}

/**
 * Registra uma sessao "livre" — exercicios escolhidos manualmente pelo
 * usuario, sem nenhum plano associado (POST /workout-sessions, fora do
 * prefixo /workout-plans). `payload.plan_id` fica undefined/None aqui.
 */
export async function logFreeWorkoutSession(payload: WorkoutSessionCreate): Promise<WorkoutSession> {
  const response = await api.post<WorkoutSession>('/workout-sessions/', payload);
  return response.data;
}

export interface WorkoutLastExercise {
  exercise_name: string;
  completed_at: string;
  sets: WorkoutSetLog[];
}

/**
 * Peso/reps da ultima vez que este exercicio foi registrado (por NOME,
 * case/espaco insensivel no backend) — cobre sessao de plano E sessao
 * livre (busca em TODAS as sessoes do usuario). null quando nunca foi
 * registrado (nao e erro, e a primeira vez). Usado pelo hint "Última vez:
 * Xkg × Y" em SetLogSection (WorkoutDayCard.tsx).
 */
export async function getLastExercisePerformance(exerciseName: string): Promise<WorkoutLastExercise | null> {
  const response = await api.get<WorkoutLastExercise | null>('/workout-sessions/last-exercise', {
    params: { exercise_name: exerciseName },
  });
  return response.data;
}

/**
 * Lista sessoes de treino (plano OU livre) do usuario, filtradas por
 * intervalo de completed_at — usada pelos marcadores de atividade "treino
 * de forca" na tela de detalhe de Frequencia cardiaca (HeartRateDetailView),
 * ao lado de corrida/pedalada (services/activities.ts) e sono (HealthKit).
 */
export async function listWorkoutSessions(startDate: Date, endDate: Date): Promise<WorkoutSession[]> {
  const response = await api.get<WorkoutSession[]>('/workout-sessions/', {
    params: { start_date: startDate.toISOString(), end_date: endDate.toISOString() },
  });
  return response.data;
}
