import React, { useCallback, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { useFocusEffect } from 'expo-router';

import { DailyActiveMinutes, getWeeklyActivity } from '@/services/dashboard';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Mesma conta do WeightChart/HealthWeeklyBarChart: largura da tela menos o
// padding do container da Home e o padding interno do LiquiglassCard.
const CHART_WIDTH = SCREEN_WIDTH - spacing2.lg * 4;

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function weekdayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()];
}

/**
 * "Atividades" da Home — grafico de barras dos ultimos 7 dias de minutos
 * ativos (Run + ManualActivity, /dashboard/weekly-activity, livre). Minutos
 * escolhido em vez de calorias/distancia: e o unico campo presente em 100%
 * dos registros de ambas as tabelas (calories_burned e nullable nas duas,
 * distancia so existe em corrida) — evita um grafico cheio de buracos.
 */
export function WeeklyActivityChart() {
  const [daily, setDaily] = useState<DailyActiveMinutes[] | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const data = await getWeeklyActivity();
      setDaily(data.daily);
    } catch {
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  if (error) {
    return <Text style={styles.emptyText}>Nao foi possivel carregar suas atividades da semana.</Text>;
  }

  if (!daily) {
    return <Text style={styles.emptyText}>Carregando...</Text>;
  }

  const hasAnyMinutes = daily.some((point) => point.minutes > 0);
  if (!hasAnyMinutes) {
    return (
      <Text style={styles.emptyText}>
        Nenhuma atividade nos ultimos 7 dias. Registre uma corrida, pedalada ou atividade manual e veja seu
        historico aqui.
      </Text>
    );
  }

  return (
    <BarChart
      data={{
        labels: daily.map((point) => weekdayLabel(point.date)),
        datasets: [{ data: daily.map((point) => point.minutes) }],
      }}
      width={CHART_WIDTH}
      height={160}
      fromZero
      withInnerLines={false}
      showValuesOnTopOfBars
      yAxisLabel=""
      yAxisSuffix=""
      chartConfig={{
        backgroundGradientFrom: colors2.surfaceContainer,
        backgroundGradientTo: colors2.surfaceContainer,
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
        labelColor: () => colors2.onSurfaceVariant,
        barPercentage: 0.6,
        propsForBackgroundLines: { stroke: colors2.outlineVariant },
        propsForLabels: { fontSize: 11 },
      }}
      style={styles.chart}
    />
  );
}

const styles = StyleSheet.create({
  chart: { borderRadius: radius2.md, marginLeft: -spacing2.md },
  emptyText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
});
