import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { USAGE_COLORS, barFillPercent, usageLevel } from '@/utils/equipmentUsage';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface EquipmentUsageBarProps {
  /** Ex: "Vida útil: 132 / 600 km" -- mostra o numero REAL, mesmo acima do limite. */
  label: string;
  /** Percentual real (sem clamp). A barra e limitada visualmente a 100%. */
  percent: number;
  /** Texto de aviso por faixa: [a partir de 80%, a partir de 100%]. */
  statusTexts: [string, string];
}

/**
 * Barra de uso simples (sem icones): cor primaria abaixo de 80%, aviso (ambar) a partir de 80% e erro
 * (vermelho) a partir de 100%. Usada na vida util do tenis e na manutencao da bike.
 */
export function EquipmentUsageBar({ label, percent, statusTexts }: EquipmentUsageBarProps) {
  const level = usageLevel(percent);
  const color = USAGE_COLORS[level];
  const statusText = level === 'warning' ? statusTexts[0] : level === 'danger' ? statusTexts[1] : null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(barFillPercent(percent)) }}>
        <View style={[styles.fill, { width: `${barFillPercent(percent)}%`, backgroundColor: color }]} />
      </View>
      {!!statusText && <Text style={[styles.status, { color }]}>{statusText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurface },
  track: {
    height: 8,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHighest,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius3.pill },
  status: { ...typography3.labelSm, textTransform: 'none', fontFamily: 'Inter_700Bold', marginTop: spacing3.xs / 2 },
});
