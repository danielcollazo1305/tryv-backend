import { api } from '@/services/api';

export interface WeightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  logged_at: string;
  created_at: string;
}

export interface WeightLogCreatePayload {
  weight_kg: number;
  logged_at: string;
}

export interface WeightLogUpdatePayload {
  weight_kg?: number;
  logged_at?: string;
}

export async function createWeightLog(payload: WeightLogCreatePayload): Promise<WeightLog> {
  const response = await api.post<WeightLog>('/weight-logs/', payload);
  return response.data;
}

export async function listWeightLogs(period = '30d'): Promise<WeightLog[]> {
  const response = await api.get<WeightLog[]>('/weight-logs/', { params: { period } });
  return response.data;
}

export async function updateWeightLog(id: string, payload: WeightLogUpdatePayload): Promise<WeightLog> {
  const response = await api.put<WeightLog>(`/weight-logs/${id}`, payload);
  return response.data;
}

export async function deleteWeightLog(id: string): Promise<void> {
  await api.delete(`/weight-logs/${id}`);
}

/** Data local do dispositivo em "YYYY-MM-DD" — evita o desvio de fuso de usar toISOString() (que e UTC). */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
