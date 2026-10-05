import { api } from '@/services/api';

/**
 * Categorias de equipamento (ids de backend/app/core/equipment_categories.py). `faixa_cardiaca` mantem o
 * id interno; o rotulo exibido e "Fita cardíaca" (ver utils/equipmentCategories.ts).
 */
export type EquipmentCategory = 'tenis' | 'bike' | 'relogio' | 'faixa_cardiaca';

export interface Equipment {
  id: string;
  category: EquipmentCategory;
  name: string;
  /** UTC naive (sem fuso): use parseUtcDate (services/challenges.ts). */
  created_at: string;

  brand: string | null;
  model: string | null;
  shoe_model_id: number | null;
  initial_distance_km: number;
  /** Tenis: vida util em km (efetiva: o servidor devolve o padrao quando o item nao tem). */
  lifespan_km: number | null;
  /** Bike: intervalo de revisao em km (efetivo). */
  maintenance_interval_km: number | null;
  last_maintenance_at: string | null;
  retired_at: string | null;
  is_default: boolean;

  // Calculados pelo servidor (aditivos).
  /** Tenis/bike: km inicial + corridas vinculadas. */
  total_distance_km: number | null;
  uses_count: number;
  /** UTC naive: use parseUtcDate. */
  last_used_at: string | null;
  /** So tenis, SEM clamp (pode passar de 100). */
  wear_percent: number | null;
  /** So bike. */
  km_since_maintenance: number | null;
  maintenance_percent: number | null;
}

export interface EquipmentCreate {
  category: EquipmentCategory;
  name: string;
  brand?: string | null;
  model?: string | null;
  shoe_model_id?: number | null;
  initial_distance_km?: number | null;
  lifespan_km?: number | null;
  maintenance_interval_km?: number | null;
  is_default?: boolean;
}

/** PATCH parcial: so os campos enviados sao aplicados. `retired: true` aposenta, `false` reativa. */
export interface EquipmentUpdate {
  name?: string;
  brand?: string | null;
  model?: string | null;
  lifespan_km?: number;
  maintenance_interval_km?: number;
  initial_distance_km?: number;
  is_default?: boolean;
  retired?: boolean;
}

/** Item do catalogo de tenis (marca + familia de modelo, sem numero de versao). */
export interface ShoeModel {
  id: number;
  brand: string;
  model: string;
  type: string;
  default_lifespan_km: number;
}

export async function getEquipment(options: { includeRetired?: boolean } = {}): Promise<Equipment[]> {
  const response = await api.get<Equipment[]>('/equipment/', {
    params: options.includeRetired ? { include_retired: true } : undefined,
  });
  return response.data;
}

export async function createEquipment(payload: EquipmentCreate): Promise<Equipment> {
  const response = await api.post<Equipment>('/equipment/', payload);
  return response.data;
}

export async function updateEquipment(id: string, patch: EquipmentUpdate): Promise<Equipment> {
  const response = await api.patch<Equipment>(`/equipment/${id}`, patch);
  return response.data;
}

/** Botao "Revisao feita" da bike: zera a contagem de km desde a ultima revisao. */
export async function markMaintenanceDone(id: string): Promise<Equipment> {
  const response = await api.post<Equipment>(`/equipment/${id}/maintenance`);
  return response.data;
}

/** So apaga item NUNCA usado; item com historico deve ser aposentado (409 caso contrario). */
export async function deleteEquipment(id: string): Promise<void> {
  await api.delete(`/equipment/${id}`);
}

export async function searchShoeModels(q: string, limit = 20): Promise<ShoeModel[]> {
  const response = await api.get<ShoeModel[]>('/shoe-models', { params: { q, limit } });
  return response.data;
}
