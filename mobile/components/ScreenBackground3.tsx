import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors3 } from '@/constants/theme';

interface ScreenBackground3Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fundo compartilhado do sistema visual novo "prism-glass" (ver colors3 em
 * constants/theme.ts) — equivalente claro do ScreenBackground2.tsx. O
 * `body` do HTML de origem e um fundo solido (`bg-background` = #fcf9f8),
 * sem nenhum wash/glow decorativo por cima (diferente do
 * ScreenBackground2, que replica o radial-gradient roxo do body escuro) —
 * entao aqui e so a cor solida.
 */
export function ScreenBackground3({ children, style }: ScreenBackground3Props) {
  return <View style={[styles.container, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors3.background },
});
