import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

import { DailyQuantityPoint } from '@/services/healthkit';
import { colors, radius, spacing, typography } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Mesma conta do WeightChart: largura da tela menos o padding do container da tela e o padding interno do Card (spacing.lg dos dois lados, duas vezes).
const CHART_WIDTH = SCREEN_WIDTH - spacing.lg * 4;

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** dateStr = 'YYYY-MM-DD' — monta a Date em horario local (nao UTC) pra nao pegar o dia da semana errado perto da virada. */
function weekdayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()];
}

interface HealthWeeklyBarChartProps {
  fetcher: () => Promise<DailyQuantityPoint[]>;
  color: string;
  unitLabel: string;
}

/**
 * Grafico de barras dos ultimos 7 dias de uma metrica + comparacao "hoje vs
 * media da semana", no estilo do grafico "Resumo" do app Saude. Busca os
 * proprios dados no mount (so e montado quando o usuario expande a linha),
 * e falha de forma contida — se a busca der erro, mostra um aviso curto em
 * vez de quebrar o card inteiro.
 */
export function HealthWeeklyBarChart({ fetcher, color, unitLabel }: HealthWeeklyBarChartProps) {
  const [data, setData] = useState<DailyQuantityPoint[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetcher()
      .then((points) => {
        if (active) setData(points);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [fetcher]);

  if (error) {
    return <Text style={styles.emptyText}>Nao foi possivel carregar o historico da semana.</Text>;
  }

  if (!data) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={color} />
      </View>
    );
  }

  const daysWithData = data.filter((point) => point.value != null);
  if (daysWithData.length === 0) {
    return <Text style={styles.emptyText}>Sem dados suficientes nos ultimos 7 dias.</Text>;
  }

  const today = data[data.length - 1];
  const average = daysWithData.reduce((sum, point) => sum + (point.value ?? 0), 0) / daysWithData.length;

  return (
    <View>
      <Text style={styles.comparison}>
        {today.value != null ? Math.round(today.value).toLocaleString('pt-BR') : '--'} hoje  •  media{' '}
        {Math.round(average).toLocaleString('pt-BR')} {unitLabel}
      </Text>
      <BarChart
        data={{
          labels: data.map((point) => weekdayLabel(point.date)),
          datasets: [{ data: data.map((point) => point.value ?? 0) }],
        }}
        width={CHART_WIDTH}
        height={160}
        fromZero
        withInnerLines={false}
        showValuesOnTopOfBars
        yAxisLabel=""
        yAxisSuffix=""
        chartConfig={{
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          decimalPlaces: 0,
          color: (opacity = 1) => hexToRgba(color, opacity),
          labelColor: () => colors.textMuted,
          barPercentage: 0.6,
          propsForBackgroundLines: { stroke: colors.border },
          propsForLabels: { fontSize: 11 },
        }}
        style={styles.chart}
      />
    </View>
  );
}

/** As cores de metrica sao hex fixo (#RRGGBB) — converte pra rgba() com a opacidade que o chart-kit pede. */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing.md },
  emptyText: { ...typography.bodySecondary, paddingVertical: spacing.sm },
  comparison: { ...typography.bodySecondary, marginBottom: spacing.sm },
  chart: { borderRadius: radius.md, marginLeft: -spacing.md },
});
