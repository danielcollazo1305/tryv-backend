import { api } from '@/services/api';
import { Meal } from '@/services/meals';

export interface SavedMeal {
  id: string;
  user_id: string;
  description: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  photo_url: string | null;
  created_at: string;
}

/** Mesmos campos e regras de MealCreatePayload (services/meals.ts): calories obrigatorio, o resto opcional. */
export interface SavedMealCreate {
  description?: string | null;
  calories: number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  photo_url?: string | null;
}

export async function createSavedMeal(payload: SavedMealCreate): Promise<SavedMeal> {
  const response = await api.post<SavedMeal>('/saved-meals/', payload);
  return response.data;
}

/** Mais recentes primeiro (ordem do backend). */
export async function getSavedMeals(): Promise<SavedMeal[]> {
  const response = await api.get<SavedMeal[]>('/saved-meals/');
  return response.data;
}

export async function deleteSavedMeal(id: string): Promise<void> {
  await api.delete(`/saved-meals/${id}`);
}

/** Usa o favorito: o backend cria uma refeicao de hoje com os mesmos campos (e roda o fluxo normal de meta/XP). */
export async function logSavedMeal(id: string): Promise<Meal> {
  const response = await api.post<Meal>(`/saved-meals/${id}/log`);
  return response.data;
}
