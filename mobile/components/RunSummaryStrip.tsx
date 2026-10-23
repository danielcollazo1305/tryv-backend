import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RunActivity, activityStrip } from '@/services/runPostState';

export interface RunSummaryStripColors {
  text: string;
  muted: string;
  background: string;
  border: string;
}

interface RunSummaryStripProps {
  activity: RunActivity;
  /** Cores do tema onde a faixa aparece (o Feed e claro; a tela do post e a de publicar sao escuras). */
  colors: RunSummaryStripColors;
}

/**
 * Faixa de resumo de um post de corrida: distancia, tempo e ritmo. Mostra so o que vem em `activity` (tipo, distancia, duracao, ritmo):
 * nunca rota, coordenada ou local. Acessivel como um bloco unico ("Corrida: 5,23 km em 28:20, ritmo 5:25 /km").
 */
export function RunSummaryStrip({ activity, colors }: RunSummaryStripProps) {
  const s = activityStrip(activity);
  return (
    <View
      style={[styles.row, { backgroundColor: colors.background, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${s.label}: ${s.distance} em ${s.duration}, ritmo ${s.pace}`}
    >
      <Stat value={s.distance} label="Distância" colors={colors} />
      <Stat value={s.duration} label="Tempo" colors={colors} />
      <Stat value={s.pace} label="Ritmo" colors={colors} />
    </View>
  );
}

function Stat({ value, label, colors }: { value: string; label: string; colors: RunSummaryStripColors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 11 },
});
