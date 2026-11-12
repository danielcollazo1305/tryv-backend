import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors3, radius3 } from '@/constants/theme';

interface MealPhotoProps {
  uri: string;
  /** Raio do canto da moldura (0 dentro de um card que ja recorta). */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Foto de refeicao do usuario: moldura 4:3 na largura disponivel, foto INTEIRA (contain) sobre fundo neutro. Nada e cortado, qualquer que seja a
 * proporcao da foto (retrato, paisagem ou quadrada): sobram faixas neutras. Mesmo componente na lista, no historico e na previa.
 */
export function MealPhoto({ uri, borderRadius = radius3.md, style }: MealPhotoProps) {
  return (
    <View style={[styles.frame, { borderRadius }, style]}>
      <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel="Foto da refeicao" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden', backgroundColor: colors3.surfaceContainerHigh },
  image: { width: '100%', height: '100%' },
});
