import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { formatShortDate } from '@/services/dashboard';
import { DailyHeartRatePoint } from '@/services/heartRate';
import { colors, radius, spacing, typography } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing.lg * 4;

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
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(248, 113, 113, ${opacity})`,
          labelColor: () => colors.textMuted,
          propsForDots: { r: '3', strokeWidth: '2', stroke: colors.danger },
          propsForBackgroundLines: { stroke: colors.border },
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
  tooltipBpm: { ...typography.bodySecondary, color: colors.text, fontWeight: '700' },
  tooltipDate: { ...typography.caption },
});
