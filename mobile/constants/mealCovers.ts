import type { ImageSourcePropType } from 'react-native';

import type { MealCoverName } from '@/utils/mealCoverPick';

// Capas de refeicao SEM foto, por tema: assets/meal-covers/<tema>/<nome>.webp. Para trocar de tema, mude MEAL_COVER_THEME.
// require() de imagem e estatico (arquivo que nao existe quebra o build): por isso o mapa lista SO os arquivos que existem. Adicionou uma
// imagem? Coloque o .webp na pasta, adicione a linha aqui, o nome em MealCoverName e a regra em utils/mealCoverPick.ts; o teste
// "Claude outputs/try_capas_refeicao.mjs" compara este mapa com a pasta e falha se divergirem.
export const MEAL_COVER_THEME = 'anime' as const;

type CoverMap = Record<MealCoverName, ImageSourcePropType>;

export const MEAL_COVERS: Record<typeof MEAL_COVER_THEME, CoverMap> = {
  anime: {
    bife: require('../assets/meal-covers/anime/bife.webp'),
    bife_ovo: require('../assets/meal-covers/anime/bife_ovo.webp'),
    file_mignon: require('../assets/meal-covers/anime/file_mignon.webp'),
    frango_legumes: require('../assets/meal-covers/anime/frango_legumes.webp'),
    peixe_assado: require('../assets/meal-covers/anime/peixe_assado.webp'),
    poke: require('../assets/meal-covers/anime/poke.webp'),
    salmao: require('../assets/meal-covers/anime/salmao.webp'),
  },
};

/** Imagem da capa no tema atual, ou null se o nome nao existir no mapa (o chamador cai no prato roxo). */
export function coverSource(name: MealCoverName | null): ImageSourcePropType | null {
  if (!name) return null;
  return MEAL_COVERS[MEAL_COVER_THEME][name] ?? null;
}
