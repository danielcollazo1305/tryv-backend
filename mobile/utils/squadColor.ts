/**
 * Cor automatica por squad no mapa de territorio, deterministica a partir
 * do id (hash simples de soma de char codes, sem lib externa) -- o mesmo
 * squad sempre cai na mesma cor da paleta, entre sessoes/dispositivos
 * diferentes, sem precisar persistir nada em lugar nenhum. Paleta fixa de
 * 12 cores saturadas o bastante pra se destacar sobre um mapa, escolhidas
 * pra nao ter 2 tons proximos (nenhuma dupla vermelho/laranja ou
 * azul/roxo adjacente, por exemplo).
 */
const SQUAD_COLOR_PALETTE = [
  '#E53935', // vermelho
  '#1E88E5', // azul
  '#43A047', // verde
  '#FB8C00', // laranja
  '#8E24AA', // roxo
  '#00ACC1', // ciano
  '#D81B60', // rosa
  '#FDD835', // amarelo
  '#3949AB', // indigo
  '#6D4C41', // marrom
  '#00897B', // verde-azulado
  '#F4511E', // vermelho-laranja
];

/** Cidade sem squad dominante (dominant_squad_id null) -- nunca passa pelo hash. */
export const NEUTRAL_TERRITORY_COLOR = '#9E9E9E';

export function squadColorFromId(squadId: string): string {
  let hash = 0;
  for (let i = 0; i < squadId.length; i++) {
    hash += squadId.charCodeAt(i);
  }
  return SQUAD_COLOR_PALETTE[hash % SQUAD_COLOR_PALETTE.length];
}
