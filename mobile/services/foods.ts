import { api } from '@/services/api';
import { Meal } from '@/services/meals';

/**
 * Alimento da TACO -- todos os valores POR 100 g. kcal/macros null = dado
 * ausente na fonte (nao zero); kcal_estimated = kcal calculada por 4P+4C+9L.
 */
export interface Food {
  id: number;
  name: string;
  category: string;
  kcal: number | null;
  protein: number | null;
  carbohydrates: number | null;
  lipids: number | null;
  kcal_estimated: boolean;
}

/** q: minimo 2 caracteres (o backend responde 422 abaixo disso). limit: padrao 20, maximo 50. */
export async function searchFoods(q: string, limit?: number): Promise<Food[]> {
  const response = await api.get<Food[]>('/foods/search', { params: { q, limit } });
  return response.data;
}

/** Registra `grams` gramas do alimento como refeicao de hoje (grams > 0 e <= 5000). Devolve a Meal criada. */
export async function logFood(foodId: number, grams: number): Promise<Meal> {
  const response = await api.post<Meal>(`/foods/${foodId}/log`, { grams });
  return response.data;
}
