import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackedBarChart } from 'react-native-chart-kit';

import { GlassCard } from '@/components/GlassCard';
import { MealDailySummary, MealsSummary, MealsSummaryPeriod, getMealsSummary } from '@/services/meals';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing3.lg * 4;
const MIN_BAR_SLOT = 34;

const PERIOD_OPTIONS: { value: MealsSummaryPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '4w', label: '4 SEM' },
  { value: '1y', label: '1 ANO' },
];

// Mesmas cores usadas no MacrosGrid (item 1), pra consistencia visual
// entre os dois — proteina/carboidrato/gordura sempre com a mesma cor em
// qualquer lugar do app.
const MACRO_COLORS = {
  protein: '#FB7185',
  carbs: '#F5A524',
  fat: '#818CF8',
};

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatBucketLabel(dateStr: string, granularity: 'day' | 'month'): string {
  const date = parseLocalDate(dateStr);
  if (granularity === 'month') {
    return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  }
  return String(date.getDate());
}

function formatWindowRange(summary: MealsSummary): string {
  const start = parseLocalDate(summary.start_date);
  const end = parseLocalDate(summary.end_date);
  if (summary.granularity === 'month') {
    const startLabel = start.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    const endLabel = end.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    return `${startLabel} - ${endLabel}`;
  }
  if (summary.start_date === summary.end_date) {
    return start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  }
  const startLabel = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const endLabel = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${startLabel} - ${endLabel}`;
}

function formatKcal(value: number | null): string {
  return value == null ? '--' : `${Math.round(value).toLocaleString('pt-BR')} kcal`;
}

function formatGrams(value: number | null): string {
  return value == null ? '--' : `${Math.round(value).toLocaleString('pt-BR')}g`;
}

/**
 * Converte kcal_total + macros (g) de um dia nos 3 segmentos empilhados
 * (kcal), na ordem proteina/gordura/carboidrato (bate com MACRO_LEGEND).
 * Proteina/carboidrato = 4 kcal/g, gordura = 9 kcal/g. Se a soma dos
 * macros convertidos nao bater exatamente com o kcal total registrado
 * (arredondamento, ou usuario editou so o campo de calorias no registro
 * manual sem preencher macro), normaliza os 3 segmentos proporcionalmente
 * pra somar o kcal total — que e a fonte de verdade da altura da barra,
 * conforme pedido.
 */
function macroSegments(day: MealDailySummary): [number, number, number] {
  if (!day.has_data || !day.calories) return [0, 0, 0];
  const proteinKcal = (day.protein ?? 0) * 4;
  const carbsKcal = (day.carbs ?? 0) * 4;
  const fatKcal = (day.fat ?? 0) * 9;
  const macroKcalSum = proteinKcal + carbsKcal + fatKcal;
  if (macroKcalSum <= 0) return [0, 0, 0];
  const scale = day.calories / macroKcalSum;
  return [proteinKcal * scale, fatKcal * scale, carbsKcal * scale];
}

export function MealsHistoryCard() {
  const [period, setPeriod] = useState<MealsSummaryPeriod>('7d');
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<MealsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getMealsSummary(period, offset));
    } catch {
      setError('Nao foi possivel carregar o historico.');
    } finally {
      setLoading(false);
    }
  }, [period, offset]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleChangePeriod = (value: MealsSummaryPeriod) => {
    setPeriod(value);
    setOffset(0);
  };

  const daily = summary?.daily ?? [];
  const chartWidth = Math.max(CHART_WIDTH, daily.length * MIN_BAR_SLOT);

  return (
    <GlassCard variant="glass" style={styles.card}>
      <Text style={styles.title}>Historico</Text>

      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((option) => {
          const selected = option.value === period;
          return (
            <Pressable
              key={option.value}
              style={[styles.periodPill, selected && styles.periodPillSelected]}
              onPress={() => handleChangePeriod(option.value)}
            >
              <Text style={[styles.periodPillText, selected && styles.periodPillTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Pressable onPress={() => setOffset((prev) => prev + 1)} hitSlop={8} style={styles.navArrow}>
          <Ionicons name="chevron-back" size={20} color={colors3.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.navLabel}>{summary ? formatWindowRange(summary) : ''}</Text>
        <Pressable
          onPress={() => setOffset((prev) => Math.max(0, prev - 1))}
          hitSlop={8}
          style={styles.navArrow}
          disabled={offset === 0}
        >
          <Ionicons name="chevron-forward" size={20} color={offset === 0 ? colors3.outlineVariant : colors3.onSurfaceVariant} />
        </Pressable>
      </View>

      {loading && <ActivityIndicator color={colors3.primary} style={styles.loading} />}
      {!!error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && summary && (
        <>
          <View style={styles.dayList}>
            {daily.map((day) => (
              <View key={day.date} style={styles.dayRow}>
                <Text style={styles.dayLabel}>{formatBucketLabel(day.date, summary.granularity)}</Text>
                <Text style={styles.dayValue}>{day.has_data ? formatKcal(day.calories) : '--'}</Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <StackedBarChart
              data={{
                labels: daily.map((d) => formatBucketLabel(d.date, summary.granularity)),
                legend: ['Proteina', 'Gordura', 'Carboidrato'],
                data: daily.map(macroSegments),
                barColors: [MACRO_COLORS.protein, MACRO_COLORS.fat, MACRO_COLORS.carbs],
              }}
              width={chartWidth}
              height={200}
              hideLegend
              withHorizontalLabels={false}
              chartConfig={{
                backgroundGradientFrom: colors3.surfaceContainer,
                backgroundGradientTo: colors3.surfaceContainer,
                color: () => colors3.onSurfaceVariant,
                labelColor: () => colors3.onSurfaceVariant,
                propsForLabels: { fontSize: 10 },
              }}
              style={styles.chart}
            />
          </ScrollView>

          <View style={styles.legend}>
            {(
              [
                ['Proteina', MACRO_COLORS.protein],
                ['Gordura', MACRO_COLORS.fat],
                ['Carboidrato', MACRO_COLORS.carbs],
              ] as const
            ).map(([label, color]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: color }]} />
                <Text style={styles.legendLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.averagesRow}>
            <View style={styles.averageStat}>
              <Text style={styles.averageLabel}>Proteina media</Text>
              <Text style={styles.averageValue}>{formatGrams(summary.avg_protein)}</Text>
            </View>
            <View style={styles.averageStat}>
              <Text style={styles.averageLabel}>Carboidrato medio</Text>
              <Text style={styles.averageValue}>{formatGrams(summary.avg_carbs)}</Text>
            </View>
            <View style={styles.averageStat}>
              <Text style={styles.averageLabel}>Gordura media</Text>
              <Text style={styles.averageValue}>{formatGrams(summary.avg_fat)}</Text>
            </View>
          </View>
        </>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.md },
  title: { ...typography3.headlineMd, fontSize: 18 },

  periodRow: { flexDirection: 'row', gap: spacing3.xs },
  periodPill: {
    flex: 1,
    paddingVertical: spacing3.sm - 2,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
  },
  periodPillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  periodPillText: { ...typography3.labelSm, fontSize: 11 },
  periodPillTextSelected: { color: colors3.white, fontWeight: '700' },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navLabel: { ...typography3.bodyMd, fontWeight: '600', textAlign: 'center', flex: 1 },

  loading: { marginVertical: spacing3.lg },
  error: { color: colors3.error, textAlign: 'center' },

  dayList: { gap: 2 },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing3.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors3.outlineVariant,
  },
  dayLabel: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  dayValue: { ...typography3.bodyMd, fontSize: 13, fontWeight: '600' },

  chart: { borderRadius: radius3.md, marginLeft: -spacing3.md },

  legend: { flexDirection: 'row', gap: spacing3.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { ...typography3.labelSm, textTransform: 'none', fontSize: 11, color: colors3.onSurfaceVariant },

  averagesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  averageStat: { alignItems: 'center', flex: 1 },
  averageLabel: { ...typography3.labelSm, textTransform: 'none', fontSize: 10, color: colors3.onSurfaceVariant },
  averageValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 16, marginTop: 2, color: colors3.onSurface },
});
