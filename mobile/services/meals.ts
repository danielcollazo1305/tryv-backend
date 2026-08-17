import { api } from '@/services/api';

export interface MealAnalysis {
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string;
}

export interface Meal {
  id: string;
  user_id: string;
  photo_url: string | null;
  description: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  logged_at: string;
}

export interface MealCreatePayload {
  photo_url?: string | null;
  description?: string | null;
  calories: number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

/** Envia a foto (local URI do device) para analise por IA — nao salva nada. */
export async function analyzeMealPhoto(imageUri: string): Promise<MealAnalysis> {
  const filename = imageUri.split('/').pop() ?? 'meal.jpg';
  const extensionMatch = /\.(\w+)$/.exec(filename);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg';
  const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  const formData = new FormData();
  // React Native aceita esse formato de objeto para representar um arquivo local em FormData.
  formData.append('file', {
    uri: imageUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  // A analise usa "thinking" no backend e pode demorar mais que o timeout
  // padrao do cliente — da mais folga so para essa chamada.
  const response = await api.post<MealAnalysis>('/meals/analyze', formData, { timeout: 45000 });
  return response.data;
}

export async function createMeal(payload: MealCreatePayload): Promise<Meal> {
  const response = await api.post<Meal>('/meals/', payload);
  return response.data;
}

export async function listMeals(): Promise<Meal[]> {
  const response = await api.get<Meal[]>('/meals/');
  return response.data;
}

export type MealsSummaryPeriod = '1d' | '7d' | '4w' | '1y';

export interface MealDailySummary {
  date: string;
  has_data: boolean;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface MealsSummary {
  period: MealsSummaryPeriod;
  granularity: 'day' | 'month';
  offset: number;
  start_date: string;
  end_date: string;
  daily: MealDailySummary[];
  avg_calories: number | null;
  avg_protein: number | null;
  avg_carbs: number | null;
  avg_fat: number | null;
}

/** Agregacao historica (kcal + 3 macros por dia ou mes) — offset navega pra janelas anteriores (0 = atual). */
export async function getMealsSummary(period: MealsSummaryPeriod, offset = 0): Promise<MealsSummary> {
  const response = await api.get<MealsSummary>('/meals/summary', { params: { period, offset } });
  return response.data;
}

/**
 * O backend serializa datetimes "ingenuos" em UTC sem sufixo de fuso
 * (ex: "2026-07-25T14:30:00"). Sem tratar isso, o JS interpretaria a
 * string como horario local, causando erro sistematico de fuso — um
 * horario tardio poderia "vazar" para o dia errado.
 */
export function parseUtcDate(isoDate: string): Date {
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoDate);
  return new Date(hasTimezone ? isoDate : `${isoDate}Z`);
}

export function isToday(isoDate: string): boolean {
  const date = parseUtcDate(isoDate);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function formatMealTime(isoDate: string): string {
  return parseUtcDate(isoDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatMealDateTime(isoDate: string): string {
  const date = parseUtcDate(isoDate);
  const dateLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const timeLabel = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel}, ${timeLabel}`;
}
