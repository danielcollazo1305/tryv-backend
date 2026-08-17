import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface ProgressSteps2Props {
  /** 1-based */
  current: number;
  total: number;
  label: string;
}

/**
 * Barra de progresso "Passo X de Y" usada nos mockups de onboarding
 * (step2-corpo.html a step7-saude-alimentar.html) — mesmo padrao visual em
 * todos: rotulo do passo + nome da etapa acima de uma barra com gradiente
 * roxo preenchendo proporcionalmente ao passo atual.
 */
export function ProgressSteps2({ current, total, label }: ProgressSteps2Props) {
  const progress = Math.min(1, Math.max(0, current / total));

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.stepText}>
          Passo {current} de {total}
        </Text>
        <Text style={styles.stepLabel}>{label}</Text>
      </View>
      <View style={styles.track}>
        <LinearGradient
          colors={[colors2.violet, colors2.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${progress * 100}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing2.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepText: { ...typography2.labelCaps, fontSize: 11, color: colors2.outline },
  stepLabel: { ...typography2.labelCaps, fontSize: 11, color: colors2.primary },
  track: {
    height: 8,
    width: '100%',
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius2.pill },
});
