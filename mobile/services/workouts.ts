import { api } from '@/services/api';

export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes: string;
}

export interface WorkoutDay {
  day: string;
  focus: string;
  exercises: WorkoutExercise[];
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
  created_at: string;
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
