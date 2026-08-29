import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { colors2, colors3, radius2 } from '@/constants/theme';

interface ObscuredCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Raio do recorte do blur — acompanhe o raio do elemento real por baixo (ex: radius2.pill pra um botao redondo). */
  borderRadius?: number;
  /**
   * 'dark' (default, inalterado) = blur escuro + icone colors2, usado por
   * todas as telas ainda no tema escuro. 'light' = blur claro, pro tema
   * "prism-glass" (colors3) — sem essa prop, um blur escuro apareceria
   * como uma mancha destoante num card claro (usado por PostCard2.tsx no
   * Feed migrado nesta tarefa). Mesmo padrao de variant ja usado em
   * HeatmapGrid/EmptyFollowingState pra componente compartilhado entre
   * telas em estagios de tema diferentes.
   */
  tint?: 'dark' | 'light';
}

/**
 * Padrao pra pontos do app onde nao existe (e nao pode existir, por
 * limitacao real de dado/backend) informacao pra mostrar — blur (mesmo
 * BlurView do LiquiglassCard) + cadeado central, sem texto, em vez de
 * deixar vazio ou inventar dado/numero falso.
 *
 * children carrega o layout real que existiria se o dado existisse (mesma
 * estrutura/dimensao), borrado atras — nunca interativo, ja que nao ha
 * acao real por tras do que esta sendo ofuscado.
 */
export function ObscuredCard({ children, style, borderRadius = radius2.md, tint = 'dark' }: ObscuredCardProps) {
  const iconColor = tint === 'light' ? colors3.onSurfaceVariant : colors2.onSurfaceVariant;
  return (
    <View style={[styles.wrapper, { borderRadius }, style]} pointerEvents="none">
      {children}
      <BlurView intensity={40} tint={tint} style={StyleSheet.absoluteFillObject} />
      <View style={styles.lockWrap}>
        <Ionicons name="lock-closed" size={18} color={iconColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    position: 'relative',
  },
  lockWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
