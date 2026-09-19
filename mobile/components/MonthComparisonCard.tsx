import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { MetricComparison, MonthComparison, getMonthComparison } from '@/services/dashboard';
import { colors3, spacing3, typography3 } from '@/constants/theme';

// colors3 nao tem token semantico de "success" -- resolvido com hex
// literal, mesmo padrao ja usado em ReadinessCard/Perfil.
const SUCCESS_COLOR = '#15803d';

function shortMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface MetricRowConfig {
  key: keyof Omit<MonthComparison, 'current_month' | 'previous_month'>;
  label: string;
  formatValue: (value: number) => string;
  /**
   * Pra onde o tile leva ao tocar — cada metrica tem uma fonte real
   * diferente no backend (ver dashboard.py), entao nao da pra usar um
   * destino generico:
   * - distance_km/workouts_count vem de Run + ManualActivity ->
   *   /activity/progress (pagina cheia com grafico + lista filtrada por
   *   periodo — troca feita nesta tarefa; antes ia pra /activity, a lista
   *   crua sem grafico nenhum, avaliada como "muito superficial". /activity
   *   continua existindo, so esses 2 tiles pararam de apontar pra la).
   * - avg_daily_calories vem de Meal.calories (refeicoes registradas) ->
   *   /meals. NAO e a mesma coisa que /health/calories (calorias
   *   ativas/queimadas do HealthKit/Health Connect) — cuidado pra nao
   *   confundir as duas.
   * - weight_change_kg vem de WeightLog -> /weight (tela nova).
   */
  route: Href;
}

const METRICS: MetricRowConfig[] = [
  {
    key: 'distance_km',
    label: 'Km percorridos',
    formatValue: (v) => `${v.toFixed(1)} km`,
    route: '/activity/progress',
  },
  {
    key: 'workouts_count',
    label: 'Treinos concluídos',
    formatValue: (v) => `${Math.round(v)}`,
    route: '/activity/progress',
  },
  {
    key: 'avg_daily_calories',
    label: 'Kcal/dia (média)',
    formatValue: (v) => `${Math.round(v)}`,
    route: '/meals',
  },
  {
    key: 'weight_change_kg',
    label: 'Variação de peso',
    formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} kg`,
    route: '/weight',
  },
];

function MetricTile({ config, comparison }: { config: MetricRowConfig; comparison: MetricComparison }) {
  const hasCurrent = comparison.current != null;
  const hasDelta = comparison.delta_absolute != null;
  const isUp = hasDelta && (comparison.delta_absolute as number) > 0;
  const isDown = hasDelta && (comparison.delta_absolute as number) < 0;
  const deltaColor = isUp ? SUCCESS_COLOR : isDown ? colors3.error : colors3.onSurfaceVariant;

  return (
    <Pressable
      style={({ pressed }) => [styles.tileWrap, pressed && styles.tileWrapPressed]}
      onPress={() => router.push(config.route)}
    >
      <GlassCard variant="card" style={styles.tile} padding={spacing3.md}>
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
      </GlassCard>
    </Pressable>
  );
}

/**
 * Adicional ao navegador de mes ja existente na Home (que so mostra um mes
 * por vez) — este card mostra mes atual x mes anterior lado a lado, sem
 * precisar navegar. Se falhar ou o usuario nao for Pro (402), some da tela
 * silenciosamente, mesmo padrao do ReadinessCard/InsightCard.
 *
 * Migrado pro tema claro "prism-glass" nesta tarefa (LiquiglassCard ->
 * GlassCard, colors2 -> colors3) — exclusivo da Home (confirmado, nenhum
 * outro import real do componente), migracao direta sem prop variant. So
 * recoloracao, nenhuma logica de comparacao mensal alterada.
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
        <ActivityIndicator size="small" color={colors3.primary} />
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
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing3.xs },
  wrapper: { gap: spacing3.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { ...typography3.headlineMd, fontSize: 18 },
  subtitle: { ...typography3.labelSm, textTransform: 'none' },

  // tileWrap (nao o GlassCard) e quem recebe flexBasis/flexGrow — mesmo
  // motivo documentado no grid do Perfil: o `style` do GlassCard so
  // alcanca o `content` interno (2 niveis abaixo do shadowWrapper que de
  // fato controla a largura no row/wrap), diferente do LiquiglassCard
  // (que aplicava `style` direto no shadowWrapper). Trocar o componente
  // mantendo flexBasis no `style` do GlassCard introduziria a mesma
  // ambiguidade de largura ja corrigida la — por isso o wrapper aqui.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  tileWrap: { flexBasis: '47%', flexGrow: 1 },
  // Mesmo valor de opacidade de feedback ao toque ja usado em Button3.tsx.
  tileWrapPressed: { opacity: 0.85 },
  tile: { gap: 4 },
  tileLabel: { ...typography3.labelSm, textTransform: 'none' },
  // Mesmo token de HealthMetricsGrid.tileValue (typography3.headlineLg,
  // Inter_700Bold) -- unificado nesta tarefa, so tamanho/lineHeight
  // ajustados pro contexto menor deste tile (era JetBrainsMono_700Bold,
  // inconsistente com o padrao de referencia do mockup original).
  tileValue: { ...typography3.headlineLg, fontSize: 22, lineHeight: 26, color: colors3.onSurface },
  deltaWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  deltaText: { ...typography3.labelSm, textTransform: 'none', fontWeight: '700' },
  deltaTextMuted: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, marginTop: 2 },
});
