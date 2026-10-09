import type { ImageSourcePropType } from 'react-native';

import type { ModalityId } from '@/services/modalities';

/** Dados fixos das 4 modalidades da tela Treinar (imagem, texto, equipamento). A ORDEM vem da API, nao daqui. */
export interface ModalityMeta {
  id: ModalityId;
  title: string;
  image: ImageSourcePropType;
  description: string;
  /** Tem distancia no painel (so tenis e bike). */
  hasDistance: boolean;
  /** Categoria de equipamento padrao mostrada no painel (so tenis e bike). */
  equipment: 'tenis' | 'bike' | null;
}

export const MODALITY_META: Record<ModalityId, ModalityMeta> = {
  tenis: {
    id: 'tenis',
    title: 'Tênis',
    image: require('@/assets/sports/tenis.png'),
    description: 'Corrida e caminhada com rastreio por GPS.',
    hasDistance: true,
    equipment: 'tenis',
  },
  bike: {
    id: 'bike',
    title: 'Bike',
    image: require('@/assets/sports/bike.png'),
    description: 'Pedalada com rastreio por GPS.',
    hasDistance: true,
    equipment: 'bike',
  },
  halter: {
    id: 'halter',
    title: 'Halter',
    image: require('@/assets/sports/halter.png'),
    description: 'Musculação: plano do dia, treino livre ou plano do personal.',
    hasDistance: false,
    equipment: null,
  },
  luva: {
    id: 'luva',
    title: 'Luva',
    image: require('@/assets/sports/luva.png'),
    description: 'Lutas: boxe, muay thai, jiu-jitsu e mais.',
    hasDistance: false,
    equipment: null,
  },
};

/** Ordem de reserva quando a API falha (o erro mantem as 4 modalidades navegaveis). */
export const MODALITY_FALLBACK_ORDER: ModalityId[] = ['bike', 'halter', 'luva', 'tenis'];
