import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { WeightPoint, formatShortDate } from '@/services/dashboard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Largura da tela menos o padding do container da Home e o padding interno do LiquiglassCard/GlassCard (spacing3.lg dos dois lados, duas vezes -- mesmo valor numerico de spacing2.lg, 24).
const CHART_WIDTH = SCREEN_WIDTH - spacing3.lg * 4;

interface SelectedPoint {
  x: number;
  y: number;
  date: string;
  weight: number;
}

/**
 * Migrado pro tema claro "prism-glass" nesta tarefa (colors2 -> colors3) —
 * exclusivo da Home (confirmado, nenhum outro import real do componente;
 * HealthWeeklyBarChart.tsx/WeeklyActivityChart.tsx so mencionam "WeightChart"
 * em comentario, nao importam), migracao direta sem prop variant. So
 * recoloracao, nenhuma logica de grafico/tooltip alterada.
 *
 * Achado fora de escopo: a Home (app/(tabs)/index.tsx) ainda envolve este
 * componente num LiquiglassCard (nao migrado) — fora desta tarefa.
 */
export function WeightChart({ data }: { data: WeightPoint[] }) {
  const [selected, setSelected] = useState<SelectedPoint | null>(null);

  if (data.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {data.length === 0
            ? 'Registre seu peso para começar a ver a evolução aqui.'
            : 'Registre mais um peso para ver o gráfico de evolução.'}
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
          backgroundGradientFrom: colors3.surfaceContainer,
          backgroundGradientTo: colors3.surfaceContainer,
          decimalPlaces: 1,
          color: (opacity = 1) => `rgba(107, 56, 212, ${opacity})`,
          labelColor: () => colors3.onSurfaceVariant,
          propsForDots: { r: '3', strokeWidth: '2', stroke: colors3.primary },
          propsForBackgroundLines: { stroke: colors3.outlineVariant },
          // Sem isso, react-native-chart-kit desenha os rotulos do eixo na
          // fonte padrao do SO (SVG Text sem fontFamily explicito) em vez
          // de Inter -- inconsistencia real encontrada na investigacao de
          // "fontes diferentes dentro da mesma tela".
          propsForLabels: { fontFamily: 'Inter_400Regular' },
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
  chart: { borderRadius: radius3.md },
  empty: { paddingVertical: spacing3.xl, alignItems: 'center' },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  tooltip: {
    position: 'absolute',
    backgroundColor: colors3.surfaceContainerHigh,
    borderRadius: radius3.sm,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    paddingHorizontal: spacing3.sm,
    paddingVertical: spacing3.xs,
    alignItems: 'center',
  },
  tooltipWeight: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurface, fontWeight: '700' },
  tooltipDate: { ...typography3.labelSm, textTransform: 'none' },
});
