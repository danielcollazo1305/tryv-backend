import React from 'react';
import { StyleSheet, View } from 'react-native';

import { RETRO } from '@/components/retro/retroTheme';
import { USAGE_LIMIT_PERCENT, USAGE_WARNING_PERCENT } from '@/utils/equipmentUsage';

interface RetroSegmentBarProps {
  /** Percentual real (sem clamp); a barra e limitada visualmente a 100%. */
  percent: number;
  segments?: number;
}

/** Barra de segmentos: cheios na cor do nivel (normal; aviso a partir de 80%; erro a partir de 100%), vazios apagados. */
export function RetroSegmentBar({ percent, segments = 12 }: RetroSegmentBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = clamped <= 0 ? 0 : Math.max(1, Math.round((clamped / 100) * segments));
  const color = percent >= USAGE_LIMIT_PERCENT ? RETRO.danger : percent >= USAGE_WARNING_PERCENT ? RETRO.warning : RETRO.accent;

  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <View key={i} style={[styles.seg, { backgroundColor: i < filled ? color : '#1a1433' }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2, height: 10, borderWidth: 2, borderColor: RETRO.border, padding: 1 },
  seg: { flex: 1 },
});
