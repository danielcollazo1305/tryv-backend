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
  day: string;
  focus: string;
  exercises: WorkoutExerciseLog[];
  duration_minutes?: number | null;
  calories_burned?: number | null;
}

export interface WorkoutSession {
  id: string;
  plan_id: string;
  exercises: { day: string; focus: string; exercises: WorkoutExerciseLog[] } | null;
  calories_burned: number | null;
  duration_minutes: number | null;
  completed_at: string;
}

/** Registra o que foi de fato executado num dia do plano (peso/reps por serie). */
export async function logWorkoutSession(planId: string, payload: WorkoutSessionCreate): Promise<WorkoutSession> {
  const response = await api.post<WorkoutSession>(`/workout-plans/${planId}/sessions`, payload);
  return response.data;
}
