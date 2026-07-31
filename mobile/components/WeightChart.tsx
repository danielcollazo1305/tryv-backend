import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { WeightPoint, formatShortDate } from '@/services/dashboard';
import { colors, radius, spacing, typography } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Largura da tela menos o padding do container da Home e o padding interno do Card (spacing.lg dos dois lados, duas vezes).
const CHART_WIDTH = SCREEN_WIDTH - spacing.lg * 4;

interface SelectedPoint {
  x: number;
  y: number;
  date: string;
  weight: number;
}

export function WeightChart({ data }: { data: WeightPoint[] }) {
  const [selected, setSelected] = useState<SelectedPoint | null>(null);

  if (data.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {data.length === 0
            ? 'Registre seu peso para comecar a ver a evolucao aqui.'
            : 'Registre mais um peso para ver o grafico de evolucao.'}
        </Text>
      </View>
    );
  }

  // Rotula so a cada ~5-7 pontos para nao poluir o eixo X.
  const step = Math.max(1, Math.ceil(data.length / 6));
  const labels = data.map((point, index) => (index % step === 0 ? formatShortDate(point.date) : ''));
  const values = data.map((point) => point.weight_kg);

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
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          decimalPlaces: 1,
          color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
          labelColor: () => colors.textMuted,
          propsForDots: { r: '3', strokeWidth: '2', stroke: colors.accent },
          propsForBackgroundLines: { stroke: colors.border },
        }}
        onDataPointClick={({ x, y, index }) => {
          setSelected({ x, y, date: data[index].date, weight: data[index].weight_kg });
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
          <Text style={styles.tooltipWeight}>{selected.weight.toFixed(1)} kg</Text>
          <Text style={styles.tooltipDate}>{formatShortDate(selected.date)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { borderRadius: radius.md },
  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },
  tooltip: {
    position: 'absolute',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  tooltipWeight: { ...typography.bodySecondary, color: colors.text, fontWeight: '700' },
  tooltipDate: { ...typography.caption },
});
