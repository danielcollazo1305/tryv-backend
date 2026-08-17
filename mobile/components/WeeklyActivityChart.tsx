import React, { useCallback, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { useFocusEffect } from 'expo-router';

import { DailyDistanceKm, getWeeklyActivity } from '@/services/dashboard';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Mesma conta do WeightChart/HealthWeeklyBarChart: largura da tela menos o
// padding do container da Home e o padding interno do LiquiglassCard.
const CHART_WIDTH = SCREEN_WIDTH - spacing2.lg * 4;

// Mesma convencao de cabecalho D S T Q Q S S do heatmap de frequencia de
// treino, pedida explicitamente pro eixo X deste grafico (diferente do
// "dom/seg/ter..." usado por HealthWeeklyBarChart).
const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function weekdayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()];
}

function formatKm(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/**
 * "Km rodados" da Home — grafico de barras dos ultimos 7 dias de distancia
 * (so Run.distance_meters, /dashboard/weekly-activity, livre). Trocado de
 * "minutos ativos" (Run+ManualActivity) pra km a pedido do usuario —
 * ManualActivity nao tem campo de distancia, entao dias com so atividade
 * manual aparecem como 0km aqui (esperado, documentado no backend).
 *
 * Limitacao conhecida: react-native-chart-kit nao e locale-aware — os
 * rotulos numericos em cima das barras (showValuesOnTopOfBars) usam ponto
 * decimal ("5.2"), nao virgula ("5,2"), mesmo com decimalPlaces=1. So o
 * texto que eu mesmo escrevo (ex: formatKm) usa o formato brasileiro de
 * verdade — precisa de validacao visual no device pra confirmar o quanto
 * isso incomoda ou nao.
 */
export function WeeklyActivityChart() {
  const [daily, setDaily] = useState<DailyDistanceKm[] | null>(null);
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
    return <Text style={styles.emptyText}>Nao foi possivel carregar seus km rodados da semana.</Text>;
  }

  if (!daily) {
    return <Text style={styles.emptyText}>Carregando...</Text>;
  }

  const hasAnyDistance = daily.some((point) => point.distance_km > 0);
  if (!hasAnyDistance) {
    return (
      <Text style={styles.emptyText}>Nenhuma corrida nos ultimos 7 dias. Registre uma corrida para ver seu grafico de km aqui.</Text>
    );
  }

  const totalKm = daily.reduce((sum, point) => sum + point.distance_km, 0);

  return (
    <View>
      <Text style={styles.total}>{formatKm(totalKm)} na semana</Text>
      <BarChart
        data={{
          labels: daily.map((point) => weekdayLabel(point.date)),
          datasets: [{ data: daily.map((point) => point.distance_km) }],
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
          decimalPlaces: 1,
          color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
          labelColor: () => colors2.onSurfaceVariant,
          barPercentage: 0.6,
          propsForBackgroundLines: { stroke: colors2.outlineVariant },
          propsForLabels: { fontSize: 11 },
        }}
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { borderRadius: radius2.md, marginLeft: -spacing2.md },
  total: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant, marginBottom: spacing2.sm },
  emptyText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
});
