import { api } from '@/services/api';

export interface DietPlanItem {
  food: string;
  quantity: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

export interface DietPlanMeal {
  name: string;
  time?: string | null;
  items: DietPlanItem[];
}

export interface DietPlanData {
  meals: DietPlanMeal[];
}

export type DietPlanStatus = 'active' | 'archived';

export interface DietPlan {
  id: string;
  user_id: string;
  trainer_id: string;
  status: DietPlanStatus;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
  daily_carbs_target: number | null;
  daily_fat_target: number | null;
  plan_data: DietPlanData | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DietPlanCreatePayload {
  user_id: string;
  plan_data: DietPlanData;
  daily_calorie_target?: number;
  daily_protein_target?: number;
  daily_carbs_target?: number;
  daily_fat_target?: number;
  notes?: string;
}

export interface DietPlanUpdatePayload {
  plan_data?: DietPlanData;
  daily_calorie_target?: number;
  daily_protein_target?: number;
  daily_carbs_target?: number;
  daily_fat_target?: number;
  notes?: string;
  status?: DietPlanStatus;
}

/** Nutricionista cria um plano para um aluno com assinatura ativa. */
export async function createDietPlan(payload: DietPlanCreatePayload): Promise<DietPlan> {
  const response = await api.post<DietPlan>('/diet-plans/', payload);
  return response.data;
}

/** Planos ativos do aluno logado. */
export async function listMyDietPlans(): Promise<DietPlan[]> {
  const response = await api.get<DietPlan[]>('/diet-plans/me');
  return response.data;
}

/** Todos os planos (ativos e arquivados) que o nutricionista logado criou para esse aluno. */
export async function listStudentDietPlans(studentId: string): Promise<DietPlan[]> {
  const response = await api.get<DietPlan[]>(`/diet-plans/students/${studentId}`);
  return response.data;
}

export async function updateDietPlan(id: string, payload: DietPlanUpdatePayload): Promise<DietPlan> {
  const response = await api.patch<DietPlan>(`/diet-plans/${id}`, payload);
  return response.data;
}
