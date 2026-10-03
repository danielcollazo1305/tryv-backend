import { api } from '@/services/api';

/** Atributos de 0-100 dos ultimos 30 dias + media simples em `overall` (ver backend/app/routers/overall.py). */
export interface OverallStats {
  forca: number;
  resistencia: number;
  consistencia: number;
  disciplina: number;
  overall: number;
}

export async function getOverallStats(): Promise<OverallStats> {
  const response = await api.get<OverallStats>('/dashboard/overall');
  return response.data;
}
