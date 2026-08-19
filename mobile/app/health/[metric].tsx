import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { BarChart } from 'react-native-chart-kit';

import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import {
  HealthHistoryGranularity,
  HealthHistoryPeriod,
  HealthMetricHistory,
  HealthMetricKey,
  fetchHealthMetricHistory,
  isHealthKitAvailable,
} from '@/services/healthkit';
import { colors2, metricColors, radius2, spacing2, typography2 } from '@/constants/theme';

type Status = 'checking' | 'unavailable' | 'disconnected' | 'ready' | 'error';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing2.lg * 4;
const MIN_BAR_SLOT = 34;

const PERIOD_OPTIONS: { value: HealthHistoryPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '4w', label: '4 SEM' },
  { value: '1y', label: '1 ANO' },
];

const METRIC_CONFIG: Record<
  HealthMetricKey,
  {
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
    unitLabel: string;
    formatValue: (value: number) => string;
  }
> = {
  heartRate: {
    label: 'Frequencia cardiaca',
    icon: 'heart',
    color: metricColors.heartRate,
    unitLabel: 'bpm',
    formatValue: (value) => `${Math.round(value)}`,
  },
  steps: {
    label: 'Passos',
    icon: 'footsteps',
    color: metricColors.steps,
    unitLabel: 'passos',
    formatValue: (value) => Math.round(value).toLocaleString('pt-BR'),
  },
  sleep: {
    label: 'Sono',
    icon: 'moon',
    color: metricColors.sleep,
    unitLabel: 'h',
    formatValue: (value) => `${value.toFixed(1)}h`,
  },
  calories: {
    label: 'Calorias ativas',
    icon: 'flame',
    color: metricColors.energy,
    unitLabel: 'kcal',
    formatValue: (value) => `${Math.round(value)}`,
  },
};

function isMetricKey(value: string | undefined): value is HealthMetricKey {
  return !!value && value in METRIC_CONFIG;
}

/** dateStr = 'YYYY-MM-DD' ou 'YYYY-MM' (granularidade mensal, sem dia) — sempre horario local. */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day ?? 1);
}

function formatBucketLabel(dateStr: string, granularity: HealthHistoryGranularity): string {
  const date = parseLocalDate(dateStr);
  if (granularity === 'month') {
    return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  }
  return String(date.getDate());
}

function formatWindowRange(history: HealthMetricHistory): string {
  const start = parseLocalDate(history.startDate);
  const end = parseLocalDate(history.endDate);
  if (history.granularity === 'month') {
    const startLabel = start.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    const endLabel = end.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    return `${startLabel} - ${endLabel}`;
  }
  if (history.startDate === history.endDate) {
    return start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  }
  const startLabel = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const endLabel = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${startLabel} - ${endLabel}`;
}

/** As cores de metrica sao hex fixo (#RRGGBB) — mesmo utilitario de HealthWeeklyBarChart.tsx/HealthMetricsGrid.tsx. */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Tela de detalhe de uma metrica de Saude (Batimentos/Passos/Sono/Calorias),
 * aberta ao tocar um tile do HealthMetricsGrid na Home. Mesmo padrao visual
 * e estrutural do historico de Refeicoes (MealsHistoryCard/getMealsSummary):
 * seletor de periodo 1D/7D/4SEM/1ANO, navegacao "< >" entre janelas, lista
 * de dias/meses e grafico de barras — aqui a fonte e o HealthKit local
 * (services/healthkit.ts, fetchHealthMetricHistory) em vez do backend,
 * entao a janela/offset e resolvida no proprio cliente.
 */
export default function HealthMetricDetailScreen() {
  const { metric: rawMetric } = useLocalSearchParams<{ metric: string }>();
  const metric = isMetricKey(rawMetric) ? rawMetric : null;
  const config = metric ? METRIC_CONFIG[metric] : null;

  const [status, setStatus] = useState<Status>('checking');
  const [period, setPeriod] = useState<HealthHistoryPeriod>('7d');
  const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<HealthMetricHistory | null>(null);

  const load = useCallback(async () => {
    if (!metric) return;
    if (Platform.OS !== 'ios') {
      setStatus('unavailable');
      return;
    }
    setStatus((prev) => (prev === 'ready' ? prev : 'checking'));
    try {
      const available = await isHealthKitAvailable();
      if (!available) {
        setStatus('unavailable');
        return;
      }
      const connected = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
      if (!connected) {
        setStatus('disconnected');
        return;
      }
      setHistory(await fetchHealthMetricHistory(metric, period, offset));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [metric, period, offset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleChangePeriod = (value: HealthHistoryPeriod) => {
    setPeriod(value);
    setOffset(0);
  };

  const daily = history?.points ?? [];
  const chartWidth = Math.max(CHART_WIDTH, daily.length * MIN_BAR_SLOT);

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{config?.label ?? 'Saude'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!config ? (
          <Text style={styles.error}>Metrica invalida.</Text>
        ) : status === 'unavailable' ? (
          <Text style={styles.emptyText}>Historico de saude disponivel so no iPhone, via Apple Health.</Text>
        ) : status === 'disconnected' ? (
          <Pressable style={styles.connectHint} onPress={() => router.push('/activity')} hitSlop={8}>
            <Text style={styles.connectHintText}>Nenhum dado sincronizado ainda. Conectar Apple Health</Text>
            <Ionicons name="chevron-forward" size={14} color={colors2.primary} />
          </Pressable>
        ) : status === 'error' ? (
          <Text style={styles.error}>Nao foi possivel carregar o historico.</Text>
        ) : (
          <LiquiglassCard style={styles.card}>
            <View style={styles.periodRow}>
              {PERIOD_OPTIONS.map((option) => {
                const selected = option.value === period;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.periodPill, selected && styles.periodPillSelected]}
                    onPress={() => handleChangePeriod(option.value)}
                  >
                    <Text style={[styles.periodPillText, selected && styles.periodPillTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.navRow}>
              <Pressable onPress={() => setOffset((prev) => prev + 1)} hitSlop={8} style={styles.navArrow}>
                <Ionicons name="chevron-back" size={20} color={colors2.onSurfaceVariant} />
              </Pressable>
              <Text style={styles.navLabel}>{history ? formatWindowRange(history) : ''}</Text>
              <Pressable
                onPress={() => setOffset((prev) => Math.max(0, prev - 1))}
                hitSlop={8}
                style={styles.navArrow}
                disabled={offset === 0}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={offset === 0 ? colors2.outlineVariant : colors2.onSurfaceVariant}
                />
              </Pressable>
            </View>

            {status === 'checking' && <ActivityIndicator color={colors2.violet} style={styles.loading} />}

            {status === 'ready' && history && (
              <>
                <Text style={styles.averageText}>
                  Media do periodo:{' '}
                  {history.average != null ? `${config.formatValue(history.average)} ${config.unitLabel}` : '--'}
                </Text>

                <View style={styles.dayList}>
                  {daily.map((point) => (
                    <View key={point.date} style={styles.dayRow}>
                      <Text style={styles.dayLabel}>{formatBucketLabel(point.date, history.granularity)}</Text>
                      <Text style={styles.dayValue}>
                        {point.value != null ? `${config.formatValue(point.value)} ${config.unitLabel}` : '--'}
                      </Text>
                    </View>
                  ))}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart
                    data={{
                      labels: daily.map((point) => formatBucketLabel(point.date, history.granularity)),
                      datasets: [{ data: daily.map((point) => point.value ?? 0) }],
                    }}
                    width={chartWidth}
                    height={200}
                    fromZero
                    withInnerLines={false}
                    yAxisLabel=""
                    yAxisSuffix=""
                    chartConfig={{
                      backgroundGradientFrom: colors2.surfaceContainer,
                      backgroundGradientTo: colors2.surfaceContainer,
                      decimalPlaces: 0,
                      color: (opacity = 1) => hexToRgba(config.color, opacity),
                      labelColor: () => colors2.onSurfaceVariant,
                      barPercentage: 0.6,
                      propsForBackgroundLines: { stroke: colors2.outlineVariant },
                      propsForLabels: { fontSize: 10 },
                    }}
                    style={styles.chart}
                  />
                </ScrollView>
              </>
            )}
          </LiquiglassCard>
        )}
      </ScrollView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.lg, paddingBottom: spacing2.xl },

  card: { gap: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center', marginTop: spacing2.xl },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center', marginTop: spacing2.xl },

  connectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing2.xl,
  },
  connectHintText: { ...typography2.bodyMd, color: colors2.primary, fontWeight: '700' },

  periodRow: { flexDirection: 'row', gap: spacing2.xs },
  periodPill: {
    flex: 1,
    paddingVertical: spacing2.sm - 2,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    alignItems: 'center',
  },
  periodPillSelected: { backgroundColor: colors2.violet, borderColor: colors2.violet },
  periodPillText: { ...typography2.labelCaps, fontSize: 11 },
  periodPillTextSelected: { color: colors2.white, fontWeight: '700' },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navLabel: { ...typography2.bodyMd, fontWeight: '600', textAlign: 'center', flex: 1 },

  loading: { marginVertical: spacing2.lg },

  averageText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },

  dayList: { gap: 2 },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing2.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors2.outlineVariant,
  },
  dayLabel: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  dayValue: { ...typography2.bodyMd, fontSize: 13, fontWeight: '600' },

  chart: { borderRadius: radius2.md, marginLeft: -spacing2.md },
});
