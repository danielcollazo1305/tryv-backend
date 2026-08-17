import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { MetricComparison, MonthComparison, getMonthComparison } from '@/services/dashboard';
import { colors2, spacing2, typography2 } from '@/constants/theme';

function shortMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface MetricRowConfig {
  key: keyof Omit<MonthComparison, 'current_month' | 'previous_month'>;
  label: string;
  formatValue: (value: number) => string;
}

const METRICS: MetricRowConfig[] = [
  { key: 'distance_km', label: 'Km percorridos', formatValue: (v) => `${v.toFixed(1)} km` },
  { key: 'workouts_count', label: 'Treinos concluidos', formatValue: (v) => `${Math.round(v)}` },
  { key: 'avg_daily_calories', label: 'Kcal/dia (media)', formatValue: (v) => `${Math.round(v)}` },
  { key: 'weight_change_kg', label: 'Variacao de peso', formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} kg` },
];

function MetricTile({ config, comparison }: { config: MetricRowConfig; comparison: MetricComparison }) {
  const hasCurrent = comparison.current != null;
  const hasDelta = comparison.delta_absolute != null;
  const isUp = hasDelta && (comparison.delta_absolute as number) > 0;
  const isDown = hasDelta && (comparison.delta_absolute as number) < 0;
  const deltaColor = isUp ? colors2.success : isDown ? colors2.danger : colors2.onSurfaceVariant;

  return (
    <LiquiglassCard style={styles.tile} padding={spacing2.md}>
      <Text style={styles.tileLabel}>{config.label}</Text>
      <Text style={styles.tileValue}>{hasCurrent ? config.formatValue(comparison.current as number) : '--'}</Text>
      {hasDelta ? (
        <View style={styles.deltaWrap}>
          <Ionicons name={isUp ? 'arrow-up' : isDown ? 'arrow-down' : 'remove'} size={12} color={deltaColor} />
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {comparison.delta_percent != null
              ? `${Math.abs(comparison.delta_percent).toFixed(0)}%`
              : config.formatValue(Math.abs(comparison.delta_absolute as number))}
          </Text>
        </View>
      ) : (
        <Text style={styles.deltaTextMuted}>sem comparação</Text>
      )}
    </LiquiglassCard>
  );
}

/**
 * Adicional ao navegador de mes ja existente na Home (que so mostra um mes
 * por vez) — este card mostra mes atual x mes anterior lado a lado, sem
 * precisar navegar. Se falhar ou o usuario nao for Pro (402), some da tela
 * silenciosamente, mesmo padrao do ReadinessCard/InsightCard.
 */
export function MonthComparisonCard() {
  const [comparison, setComparison] = useState<MonthComparison | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    try {
      setComparison(await getMonthComparison());
    } catch {
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchComparison();
    }, [fetchComparison])
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors2.violet} />
      </View>
    );
  }

  if (!comparison) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.title}>Comparação mensal</Text>
        <Text style={styles.subtitle}>
          {shortMonthLabel(comparison.current_month)} vs. {shortMonthLabel(comparison.previous_month)}
        </Text>
      </View>
      <View style={styles.grid}>
        {METRICS.map((config) => (
          <MetricTile key={config.key} config={config} comparison={comparison[config.key]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing2.xs },
  wrapper: { gap: spacing2.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { ...typography2.headlineMd, fontSize: 18 },
  subtitle: { ...typography2.labelCaps, textTransform: 'none' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 4 },
  tileLabel: { ...typography2.labelCaps, textTransform: 'none' },
  tileValue: { ...typography2.metricMono, fontSize: 22 },
  deltaWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  deltaText: { ...typography2.labelCaps, textTransform: 'none', fontWeight: '700' },
  deltaTextMuted: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant, marginTop: 2 },
});
