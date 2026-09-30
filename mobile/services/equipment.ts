import { api } from '@/services/api';

/** Mesmas 5 categorias fixas de backend/app/core/equipment_categories.py. */
export type EquipmentCategory = 'tenis' | 'luva_faixa' | 'bike' | 'suplemento' | 'faixa_cardiaca';

export interface Equipment {
  id: string;
  category: EquipmentCategory;
  name: string;
  created_at: string;
}

export interface EquipmentCreate {
  category: EquipmentCategory;
  name: string;
}

export async function createEquipment(payload: EquipmentCreate): Promise<Equipment> {
  const response = await api.post<Equipment>('/equipment/', payload);
  return response.data;
}

export async function getEquipment(): Promise<Equipment[]> {
  const response = await api.get<Equipment[]>('/equipment/');
  return response.data;
}

export async function deleteEquipment(id: string): Promise<void> {
  await api.delete(`/equipment/${id}`);
}
