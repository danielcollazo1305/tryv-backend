import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { EquipmentCategory } from '@/services/equipment';

/** Mesma ordem de EQUIPMENT_CATEGORIES no backend -- usada tambem pra listar as 5 opcoes fixas no modal de criar item. */
export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  'tenis',
  'luva_faixa',
  'bike',
  'suplemento',
  'faixa_cardiaca',
];

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  tenis: 'Tênis',
  luva_faixa: 'Luva/Faixa',
  bike: 'Bike',
  suplemento: 'Suplemento',
  faixa_cardiaca: 'Faixa Cardíaca',
};

export const EQUIPMENT_CATEGORY_ICONS: Record<EquipmentCategory, ComponentProps<typeof Ionicons>['name']> = {
  tenis: 'footsteps-outline',
  luva_faixa: 'hand-left-outline',
  bike: 'bicycle-outline',
  suplemento: 'nutrition-outline',
  faixa_cardiaca: 'pulse-outline',
};
