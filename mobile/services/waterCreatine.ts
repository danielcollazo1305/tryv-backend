import { api } from '@/services/api';

export interface WaterLog {
  id: string;
  user_id: string;
  amount_ml: number;
  logged_at: string;
}

export interface WaterToday {
  total_ml: number;
}

export interface CreatineLog {
  id: string;
  user_id: string;
  /** 'YYYY-MM-DD' -- so a data, 1 registro por dia. */
  logged_at: string;
}

export interface CreatineToday {
  taken_today: boolean;
}

/** amount_ml: 1 a 5000 por registro (validado no backend, ver schemas/water_log.py). logged_at fica por conta do servidor (agora). */
export async function logWater(amountMl: number): Promise<WaterLog> {
  const response = await api.post<WaterLog>('/water-logs/', { amount_ml: amountMl });
  return response.data;
}

export async function getWaterToday(): Promise<WaterToday> {
  const response = await api.get<WaterToday>('/water-logs/today');
  return response.data;
}

/** Idempotente no backend: se ja marcou hoje, devolve o registro existente (200) em vez de duplicar. */
export async function logCreatine(): Promise<CreatineLog> {
  const response = await api.post<CreatineLog>('/creatine-logs/');
  return response.data;
}

export async function getCreatineToday(): Promise<CreatineToday> {
  const response = await api.get<CreatineToday>('/creatine-logs/today');
  return response.data;
}
