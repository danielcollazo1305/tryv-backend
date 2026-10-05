import { EquipmentCategory } from '@/services/equipment';

/** Ordem de exibicao (e mesma lista de EQUIPMENT_CATEGORIES no backend). */
export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = ['tenis', 'bike', 'relogio', 'faixa_cardiaca'];

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  tenis: 'Tênis',
  bike: 'Bike',
  relogio: 'Relógio',
  faixa_cardiaca: 'Fita cardíaca',
};

/** Categorias que podem ser o equipamento padrao, ter barra de uso e vincular a atividades. */
export const DEFAULT_ELIGIBLE_CATEGORIES: EquipmentCategory[] = ['tenis', 'bike'];
