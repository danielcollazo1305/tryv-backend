import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { formatShortDate } from '@/services/dashboard';
import { DailyHeartRatePoint } from '@/services/heartRate';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// Migrado pro tema claro (colors3) junto com app/heart-rate-report.tsx -- unico
// consumidor do componente, entao troca direta, sem prop variant.
const SCREEN_WIDTH = Dimensions.get('window').width;
// 2x margem da tela + 2x padding interno do GlassCard (spacing3.lg cada)
const CHART_WIDTH = SCREEN_WIDTH - spacing3.containerMargin * 2 - spacing3.lg * 2;

interface SelectedPoint {
  x: number;
  y: number;
  date: string;
  bpm: number;
}

export function HeartRateChart({ data }: { data: DailyHeartRatePoint[] }) {
  const [selected, setSelected] = useState<SelectedPoint | null>(null);

  if (data.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {data.length === 0
            ? 'Sem amostras de frequencia cardiaca nos ultimos 30 dias.'
            : 'Poucos dias com amostra ainda — o grafico aparece com mais dados.'}
        </Text>
      </View>
    );
  }

  const step = Math.max(1, Math.ceil(data.length / 6));
  const labels = data.map((point, index) => (index % step === 0 ? formatShortDate(point.date) : ''));
  const values = data.map((point) => point.avg_bpm);

  return (
    <View>
      <LineChart
        data={{ labels, datasets: [{ data: values }] }}
        width={CHART_WIDTH}
        height={200}
        bezier
        fromZero={false}
        withInnerLines={false}
        withOuterLines={false}
        segments={4}
        chartConfig={{
          backgroundGradientFrom: colors3.surfaceContainerLowest,
          backgroundGradientTo: colors3.surfaceContainerLowest,
          backgroundGradientFromOpacity: 0,
          backgroundGradientToOpacity: 0,
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(186, 26, 26, ${opacity})`,
          labelColor: () => colors3.onSurfaceVariant,
          propsForDots: { r: '3', strokeWidth: '2', stroke: colors3.error },
          propsForBackgroundLines: { stroke: colors3.outlineVariant },
        }}
        onDataPointClick={({ x, y, index }) => {
          setSelected({ x, y, date: data[index].date, bpm: data[index].avg_bpm });
        }}
        style={styles.chart}
      />
      {!!selected && (
        <View
          style={[
            styles.tooltip,
            { left: Math.max(0, Math.min(selected.x - 45, CHART_WIDTH - 90)), top: Math.max(0, selected.y - 50) },
          ]}
        >
          <Text style={styles.tooltipBpm}>{Math.round(selected.bpm)} bpm</Text>
          <Text style={styles.tooltipDate}>{formatShortDate(selected.date)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { borderRadius: radius3.md },
  empty: { paddingVertical: spacing3.xl, alignItems: 'center' },
  emptyText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant, textAlign: 'center' },
  tooltip: {
    position: 'absolute',
    backgroundColor: colors3.surfaceContainerLowest,
    borderRadius: radius3.sm,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    paddingHorizontal: spacing3.sm,
    paddingVertical: spacing3.xs,
    alignItems: 'center',
  },
  tooltipBpm: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurface, fontWeight: '700' },
  tooltipDate: { ...typography3.labelSm },
});
