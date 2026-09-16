import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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
 *
 * Repintado pro tema claro "prism-glass" (colors3) — unico consumer hoje e
 * app/subscriptions/pro.tsx, ja migrado; por isso sem variant dark/light
 * como SelectionCard2/ProgressSteps2/TextField2/ChoiceGroup2 (nao ha
 * nenhuma tela escura usando este componente pra preservar).
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
    borderRadius: radius3.pill,
    borderWidth: 1,
    paddingHorizontal: spacing3.md - 4,
    paddingVertical: 4,
    backgroundColor: colors3.surfaceContainerHigh,
  },
  primaryPill: {
    borderColor: 'rgba(132, 85, 239, 0.3)',
  },
  secondaryPill: {
    borderColor: colors3.outlineVariant,
  },
  label: {
    ...typography3.labelSm,
    textTransform: 'uppercase',
  },
  primaryLabel: {
    color: colors3.primary,
  },
  secondaryLabel: {
    color: colors3.onSurfaceVariant,
  },
});
