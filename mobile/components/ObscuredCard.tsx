import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { colors2, radius2 } from '@/constants/theme';

interface ObscuredCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Raio do recorte do blur — acompanhe o raio do elemento real por baixo (ex: radius2.pill pra um botao redondo). */
  borderRadius?: number;
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
export function ObscuredCard({ children, style, borderRadius = radius2.md }: ObscuredCardProps) {
  return (
    <View style={[styles.wrapper, { borderRadius }, style]} pointerEvents="none">
      {children}
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.lockWrap}>
        <Ionicons name="lock-closed" size={18} color={colors2.onSurfaceVariant} />
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
