import React from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

import { RETRO, useRetroFont } from '@/components/retro/retroTheme';

interface RetroTextProps extends TextProps {
  /** Tamanho em pt (Press Start 2P e larga: 8 a 12 ja e confortavel). */
  size?: number;
  color?: string;
  /** Padrao true: caixa alta (a fonte pixel e feita pra isso). */
  upper?: boolean;
}

/** Texto pixel da tela Treinar. Escala de fonte do sistema limitada a ~1.2 pra nao quebrar o layout. */
export function RetroText({ size = 10, color = RETRO.text, upper = true, style, children, ...rest }: RetroTextProps) {
  const family = useRetroFont();
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      {...rest}
      style={[styles.base, { fontFamily: family, fontSize: size, lineHeight: Math.round(size * 1.6), color }, style]}
    >
      {upper && typeof children === 'string' ? children.toUpperCase() : children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false },
});
