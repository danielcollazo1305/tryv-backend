import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface BadgeProps {
  label: string;
  /** primary = selo "PRO" (lavanda); secondary = selo "TEAM [Nome]" (neutro). */
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
}

/**
 * Selo pequeno usado no perfil e em cards (ex: "PRO", "TEAM RAFAEL SILVA").
 * Mesmo padrao visual em todas as telas que usam badge (Marketplace, Rede
 * Social, Assinatura, Configuracoes).
 */
export function Badge({ label, variant = 'secondary', style }: BadgeProps) {
  const isPrimary = variant === 'primary';

  return (
    <View style={[styles.pill, isPrimary ? styles.primaryPill : styles.secondaryPill, style]}>
      <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.secondaryLabel]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius2.pill,
    borderWidth: 1,
    paddingHorizontal: spacing2.md - 4,
    paddingVertical: 4,
    backgroundColor: colors2.surfaceContainerHigh,
  },
  primaryPill: {
    borderColor: 'rgba(208, 188, 255, 0.2)',
  },
  secondaryPill: {
    borderColor: 'rgba(73, 68, 84, 0.3)',
  },
  label: {
    ...typography2.labelCaps,
  },
  primaryLabel: {
    color: colors2.primary,
  },
  secondaryLabel: {
    color: colors2.onSurfaceVariant,
  },
});
