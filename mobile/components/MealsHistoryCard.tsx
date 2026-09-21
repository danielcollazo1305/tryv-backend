import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

import { GlassCard } from '@/components/GlassCard';
import { MealDailySummary, MealsSummary, MealsSummaryPeriod, getMealsSummary } from '@/services/meals';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing3.lg * 4;
const MIN_BAR_SLOT = 34;

/** Altura da area do grafico (px) -- mesma ordem de grandeza do grafico de progresso (ActivityProgressChart), sem precisar ser identica (componentes diferentes, sem prop compartilhada). */
const CHART_HEIGHT = 160;
/** Espaco entre barras -- ligado a spacing3 em vez de um valor solto da lib antiga. */
const BAR_GAP = spacing3.xs;
/** Raio dos cantos de cada barra -- ligado a radius3 em vez do "4" fixo que a lib usava por padrao. */
const BAR_RADIUS = radius3.sm;
/** Altura minima (px) da barra "fantasma" de um dia sem registro (has_data=false ou 0 kcal) -- so pra marcar a posicao no eixo sem o dia sumir do grafico quando a maioria dos dias esta vazia (ex: 1 de 7 preenchido). */
const EMPTY_BAR_HEIGHT = 4;

/** Retangulo com cantos arredondados so no topo (base reta, sentada no eixo) -- usado como clipPath de cada barra empilhada, pra so a silhueta externa ficar arredondada (os segmentos de cor por dentro continuam retos, sem "denteados" entre proteina/gordura/carboidrato). */
function roundedTopRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (r === 0) return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  return (
    `M ${x} ${y + height} ` +
    `L ${x} ${y + r} ` +
    `Q ${x} ${y} ${x + r} ${y} ` +
    `L ${x + width - r} ${y} ` +
    `Q ${x + width} ${y} ${x + width} ${y + r} ` +
    `L ${x + width} ${y + height} Z`
  );
}

/** Soma dos 3 segmentos (kcal) -- usado pra escala do eixo Y e pra decidir se o dia tem barra "de verdade" ou "fantasma". */
function totalSegmentKcal(day: MealDailySummary): number {
  const [protein, fat, carbs] = macroSegments(day);
  return protein + fat + carbs;
}

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
      setError('Não foi possível carregar o histórico.');
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
  const slotWidth = daily.length > 0 ? chartWidth / daily.length : 0;
  const barWidth = Math.max(4, slotWidth - BAR_GAP);
  const maxTotalKcal = Math.max(...daily.map(totalSegmentKcal), 1);

  return (
    <GlassCard variant="glass" style={styles.card}>
      <Text style={styles.title}>Histórico</Text>

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
            <View>
              <Svg width={chartWidth} height={CHART_HEIGHT}>
                {/* Clip de cada barra -- silhueta com cantos so no topo, os <Rect> dos segmentos por dentro ficam retos e saem cortados nessa forma. */}
                <Defs>
                  {daily.map((day, index) => {
                    const total = totalSegmentKcal(day);
                    if (total <= 0) return null;
                    const barHeight = Math.max(8, (total / maxTotalKcal) * CHART_HEIGHT);
                    const x = index * slotWidth + (slotWidth - barWidth) / 2;
                    const y = CHART_HEIGHT - barHeight;
                    return (
                      <ClipPath key={day.date} id={`meal-bar-clip-${index}`}>
                        <Path d={roundedTopRectPath(x, y, barWidth, barHeight, BAR_RADIUS)} />
                      </ClipPath>
                    );
                  })}
                </Defs>

                {/* Linha de base discreta -- unica linha de grade mantida (o valor exato de cada dia ja aparece na lista de texto acima, entao o grafico nao precisa de mais linhas tracejadas pra ser legivel). */}
                <Line x1={0} y1={CHART_HEIGHT} x2={chartWidth} y2={CHART_HEIGHT} stroke={colors3.outlineVariant} strokeWidth={1} opacity={0.5} />

                {daily.map((day, index) => {
                  const x = index * slotWidth + (slotWidth - barWidth) / 2;
                  const total = totalSegmentKcal(day);

                  if (total <= 0) {
                    // Dia sem registro -- barra "fantasma" baixa e neutra, so pra marcar a posicao no eixo (some do grafico seria pior quando a maioria dos dias esta vazia, ex: 1 de 7 preenchido).
                    return (
                      <Path
                        key={day.date}
                        d={roundedTopRectPath(x, CHART_HEIGHT - EMPTY_BAR_HEIGHT, barWidth, EMPTY_BAR_HEIGHT, BAR_RADIUS)}
                        fill={colors3.surfaceVariant}
                      />
                    );
                  }

                  const barHeight = Math.max(8, (total / maxTotalKcal) * CHART_HEIGHT);
                  const [proteinKcal, fatKcal, carbsKcal] = macroSegments(day);
                  // Mesma ordem visual (base->topo) da versao antiga: proteina, gordura, carboidrato.
                  const segments = [
                    { kcal: proteinKcal, color: MACRO_COLORS.protein },
                    { kcal: fatKcal, color: MACRO_COLORS.fat },
                    { kcal: carbsKcal, color: MACRO_COLORS.carbs },
                  ];
                  let cumHeight = 0;
                  return (
                    <G key={day.date} clipPath={`url(#meal-bar-clip-${index})`}>
                      {segments.map((segment, segmentIndex) => {
                        const segmentHeight = (segment.kcal / total) * barHeight;
                        const segmentY = CHART_HEIGHT - cumHeight - segmentHeight;
                        cumHeight += segmentHeight;
                        return (
                          <Rect
                            key={segmentIndex}
                            x={x}
                            y={segmentY}
                            width={barWidth}
                            height={segmentHeight}
                            fill={segment.color}
                          />
                        );
                      })}
                    </G>
                  );
                })}
              </Svg>

              <View style={[styles.chartLabelsRow, { width: chartWidth }]}>
                {daily.map((day, index) => (
                  <Text key={day.date} style={[styles.chartBarLabel, { width: slotWidth }]}>
                    {formatBucketLabel(day.date, summary.granularity)}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.legend}>
            {(
              [
                ['Proteína', MACRO_COLORS.protein],
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
              <Text style={styles.averageLabel}>Proteína média</Text>
              <Text style={styles.averageValue}>{formatGrams(summary.avg_protein)}</Text>
            </View>
            <View style={styles.averageStat}>
              <Text style={styles.averageLabel}>Carboidrato médio</Text>
              <Text style={styles.averageValue}>{formatGrams(summary.avg_carbs)}</Text>
            </View>
            <View style={styles.averageStat}>
              <Text style={styles.averageLabel}>Gordura média</Text>
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
  periodPillTextSelected: { color: colors3.white, fontFamily: 'Inter_700Bold' },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  // fontFamily real (Inter_600SemiBold) em vez de fontWeight sobreposto a
  // bodyMd (Inter_400Regular) -- fontWeight nao tem efeito confiavel
  // quando fontFamily ja nomeia um arquivo de peso especifico.
  navLabel: { ...typography3.bodyMd, fontFamily: 'Inter_600SemiBold', textAlign: 'center', flex: 1 },

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
  dayLabel: { ...typography3.labelSm, fontSize: 13, color: colors3.onSurfaceVariant },
  // fontFamily real (Inter_600SemiBold) em vez de fontWeight sobreposto a
  // bodyMd -- mesmo motivo do navLabel acima.
  dayValue: { ...typography3.bodyMd, fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors3.onSurface },

  chartLabelsRow: { flexDirection: 'row', marginTop: spacing3.xs },
  chartBarLabel: { ...typography3.labelSm, fontSize: 10, color: colors3.outline, textAlign: 'center' },

  legend: { flexDirection: 'row', gap: spacing3.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { ...typography3.labelSm, textTransform: 'none', fontSize: 11, color: colors3.onSurfaceVariant },

  averagesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  averageStat: { alignItems: 'center', flex: 1 },
  averageLabel: { ...typography3.labelSm, textTransform: 'none', fontSize: 10, color: colors3.onSurfaceVariant },
  averageValue: { ...typography3.headlineLg, fontSize: 16, lineHeight: 20, marginTop: 2, color: colors3.onSurface },
});
