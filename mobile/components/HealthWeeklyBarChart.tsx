import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

import { DailyQuantityPoint } from '@/services/health';
import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Mesma conta do WeightChart: largura da tela menos o padding do container da tela e o padding interno do LiquiglassCard/GlassCard (spacing2.lg ou spacing3.lg dos dois lados, duas vezes -- os dois valem 24, entao a conta e igual nos dois variants).
const CHART_WIDTH = SCREEN_WIDTH - spacing2.lg * 4;

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
  /** 'dark' (padrao) = colors2, unico consumidor hoje (HealthSummaryCard.tsx). 'light' = colors3, propagado quando HealthSummaryCard recebe variant="light". */
  variant?: 'dark' | 'light';
}

/**
 * Grafico de barras dos ultimos 7 dias de uma metrica + comparacao "hoje vs
 * media da semana", no estilo do grafico "Resumo" do app Saude. Busca os
 * proprios dados no mount (so e montado quando o usuario expande a linha),
 * e falha de forma contida — se a busca der erro, mostra um aviso curto em
 * vez de quebrar o card inteiro.
 */
export function HealthWeeklyBarChart({ fetcher, color, unitLabel, variant = 'dark' }: HealthWeeklyBarChartProps) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
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
    return <Text style={s.emptyText}>Nao foi possivel carregar o historico da semana.</Text>;
  }

  if (!data) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="small" color={color} />
      </View>
    );
  }

  const daysWithData = data.filter((point) => point.value != null);
  if (daysWithData.length === 0) {
    return <Text style={s.emptyText}>Sem dados suficientes nos ultimos 7 dias.</Text>;
  }

  const today = data[data.length - 1];
  const average = daysWithData.reduce((sum, point) => sum + (point.value ?? 0), 0) / daysWithData.length;
  const backgroundColor = isLight ? colors3.surfaceContainer : colors2.surfaceContainer;
  const labelColor = isLight ? colors3.onSurfaceVariant : colors2.onSurfaceVariant;

  return (
    <View>
      <Text style={s.comparison}>
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
          backgroundGradientFrom: backgroundColor,
          backgroundGradientTo: backgroundColor,
          decimalPlaces: 0,
          color: (opacity = 1) => hexToRgba(color, opacity),
          labelColor: () => labelColor,
          barPercentage: 0.6,
          propsForBackgroundLines: { stroke: isLight ? colors3.outlineVariant : colors2.outlineVariant },
          // fontFamily adicionado -- sem isso, chart-kit desenha o rotulo
          // na fonte padrao do SO (SVG Text sem fontFamily explicito) em
          // vez de Inter. Inter_400Regular e a mesma string em
          // fonts2.interRegular e fonts3.interRegular, entao vale pros 2 variants.
          propsForLabels: { fontSize: 11, fontFamily: 'Inter_400Regular' },
        }}
        style={s.chart}
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
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing2.md },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, paddingVertical: spacing2.sm },
  comparison: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant, marginBottom: spacing2.sm },
  chart: { borderRadius: radius2.md, marginLeft: -spacing2.md },
});

const stylesLight = StyleSheet.create({
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing3.md },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, paddingVertical: spacing3.sm },
  comparison: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant, marginBottom: spacing3.sm },
  chart: { borderRadius: radius3.md, marginLeft: -spacing3.md },
});
