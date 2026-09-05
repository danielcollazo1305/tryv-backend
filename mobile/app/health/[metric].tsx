import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { GlassCard } from '@/components/GlassCard';
import { HeartRateDetailView } from '@/components/HeartRateDetailView';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { SleepDetailView } from '@/components/SleepDetailView';
import {
  ensureHealthAuthorized,
  HEALTH_SOURCE_LABEL,
  HEALTHKIT_CONNECTED_KEY,
  HealthHistoryGranularity,
  HealthHistoryPeriod,
  HealthMetricHistory,
  HealthMetricKey,
  fetchHealthMetricHistory,
  isHealthAvailable,
} from '@/services/health';
import { colors3, metricColors, radius3, spacing3, typography3 } from '@/constants/theme';

// Migrado de JetBrains Mono pra Inter nesta tarefa -- decisao deliberada de
// consistencia com o resto do app (o mockup aprovado, Tryv Metricas.dc.html,
// pedia Mono aqui, mas o padrao virou Inter em todas as outras telas
// migradas). Inter_700Bold ja carregado globalmente (fontsToLoad2).
const INTER_BOLD = 'Inter_700Bold';

type Status = 'checking' | 'unavailable' | 'disconnected' | 'ready' | 'error';

const PERIOD_OPTIONS: { value: HealthHistoryPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '4w', label: '4 SEM' },
  { value: '1y', label: '1 ANO' },
];

// Rotulo do "vs. X" do badge de variacao — combinado com o offset+1 de
// fetchHealthMetricHistory (mesmo periodo, janela anterior) pra virar um
// numero real, nao ilustrativo (ver investigacao/aprovacao anterior).
const PERIOD_COMPARISON_LABEL: Record<HealthHistoryPeriod, string> = {
  '1d': 'dia ant.',
  '7d': 'sem. ant.',
  '4w': '4 sem. ant.',
  '1y': 'ano ant.',
};

// Cores do badge de variacao — valores exatos do mockup aprovado (Tryv
// Metricas.dc.html: deltaBg/deltaFg), nao uma aproximacao via opacidade de
// colors3.success (que nem existe — colors3 nao tem token semantico de
// sucesso/erro separado, so "up" verde e "neutro" roxo-acinzentado, iguais
// aos do design de origem).
const DELTA_UP_BG = '#eaf7ef';
const DELTA_UP_FG = '#1f7a44';
const DELTA_DOWN_BG = '#f6f2fc';
const DELTA_DOWN_FG = '#494454';

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

/** Abreviacao do dia da semana ("Qua", "Qui"...) pra lista de dias — so faz sentido pra granularidade diaria (7D/4SEM), nao mensal (1ANO). */
function formatWeekdayLabel(dateStr: string): string {
  const label = parseLocalDate(dateStr).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  // As 4 metricas (Passos/Calorias/Sono/FC) estao todas no tema claro
  // "prism-glass" agora — Sono e FC migraram nesta tarefa (seguindo o
  // mockup aprovado Tryv FC e Sono.dc.html), completando a migracao que
  // Passos/Calorias ja tinham feito antes. SleepDetailView/HeartRateDetailView
  // tem seu proprio StyleSheet com colors3 importado independentemente —
  // esse arquivo so precisa do header/fundo compartilhado, sem branch de
  // tema nenhum mais.

  const [status, setStatus] = useState<Status>('checking');
  const [period, setPeriod] = useState<HealthHistoryPeriod>('7d');
  const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<HealthMetricHistory | null>(null);
  /** Media do MESMO periodo, 1 janela atras (offset+1) — so pro badge de variacao percentual real (ver comentario acima de PERIOD_COMPARISON_LABEL). */
  const [previousAverage, setPreviousAverage] = useState<number | null>(null);

  const load = useCallback(async () => {
    // Sono e Frequencia cardiaca tem tela propria (SleepDetailView /
    // HeartRateDetailView, mais abaixo) — nao usam o fluxo generico de
    // periodo/historico deste componente, e cuidam da propria checagem de
    // disponibilidade/autorizacao sozinhas.
    if (!metric || metric === 'sleep' || metric === 'heartRate') return;
    // iOS -> Apple HealthKit, Android -> Health Connect (ver services/health.ts).
    // Passos e Calorias funcionam nas 2; Sono/FC ja retornaram acima.
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      setStatus('unavailable');
      return;
    }
    setStatus((prev) => (prev === 'ready' ? prev : 'checking'));
    try {
      const available = await isHealthAvailable();
      if (!available) {
        setStatus('unavailable');
        return;
      }
      // ensureHealthAuthorized checa a autorizacao REAL (nao so a flag
      // local) — ver services/healthkit.ts.
      const authorized = await ensureHealthAuthorized();
      if (!authorized) {
        setStatus('disconnected');
        return;
      }
      await SecureStore.setItemAsync(HEALTHKIT_CONNECTED_KEY, 'true');
      const [current, previous] = await Promise.all([
        fetchHealthMetricHistory(metric, period, offset),
        fetchHealthMetricHistory(metric, period, offset + 1),
      ]);
      setHistory(current);
      setPreviousAverage(previous.average);
      setStatus('ready');
    } catch (err) {
      // DEBUG TEMPORARIO — o catch generico anterior descartava a excecao
      // de verdade (nunca logada em lugar nenhum), tornando impossivel
      // saber SE era permissao/rede/exception nativa do HealthKit sem isso.
      // Remover depois de identificada a causa raiz real.
      console.error(
        `[DEBUG health/[metric]] falha ao buscar historico (metric=${metric}, period=${period}, offset=${offset}):`,
        err
      );
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
  const maxValue = Math.max(1, ...daily.map((p) => p.value ?? 0));

  // Variacao percentual real: media do periodo atual vs. media do MESMO
  // periodo, 1 janela atras (offset+1) — nao um numero ilustrativo (ver
  // investigacao/aprovacao anterior). null quando falta um dos dois lados
  // (ex: sem dado no periodo anterior) — nesse caso o badge nao aparece.
  const deltaPercent =
    history?.average != null && previousAverage != null && previousAverage !== 0
      ? ((history.average - previousAverage) / previousAverage) * 100
      : null;

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          {!!config && <View style={[styles.headerDot, { backgroundColor: config.color }]} />}
          <Text style={styles.headerTitle}>{config?.label ?? 'Saude'}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!config ? (
          <Text style={styles.error}>Metrica invalida.</Text>
        ) : metric === 'sleep' ? (
          <SleepDetailView />
        ) : metric === 'heartRate' ? (
          <HeartRateDetailView />
        ) : status === 'unavailable' ? (
          <Text style={styles.emptyText}>
            {Platform.OS === 'android'
              ? 'Instale ou atualize o app Health Connect pra ver seu historico de saude aqui.'
              : 'Historico de saude disponivel so no iPhone, via Apple Health.'}
          </Text>
        ) : status === 'disconnected' ? (
          <Pressable style={styles.connectHint} onPress={() => router.push('/activity')} hitSlop={8}>
            <Text style={styles.connectHintText}>Nenhum dado sincronizado ainda. Conectar {HEALTH_SOURCE_LABEL}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors3.primary} />
          </Pressable>
        ) : status === 'error' ? (
          <Text style={styles.error}>Nao foi possivel carregar o historico.</Text>
        ) : (
          <GlassCard variant="glass" style={styles.card}>
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
                <Ionicons name="chevron-back" size={20} color={colors3.onSurfaceVariant} />
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
                  color={offset === 0 ? colors3.outlineVariant : colors3.onSurfaceVariant}
                />
              </Pressable>
            </View>

            {status === 'checking' && <ActivityIndicator color={colors3.primary} style={styles.loading} />}

            {status === 'ready' && history && (
              <View style={styles.readyContent}>
                <View style={styles.averageCard}>
                  <Text style={styles.averageEyebrow}>Média do período</Text>
                  <View style={styles.averageRow}>
                    <Text style={styles.averageValue}>
                      {history.average != null ? config.formatValue(history.average) : '--'}
                    </Text>
                    <Text style={styles.averageUnit}>{config.unitLabel}</Text>
                    {deltaPercent != null && (
                      <View
                        style={[
                          styles.deltaBadge,
                          { backgroundColor: deltaPercent >= 0 ? DELTA_UP_BG : DELTA_DOWN_BG },
                        ]}
                      >
                        <Text
                          style={[styles.deltaBadgeText, { color: deltaPercent >= 0 ? DELTA_UP_FG : DELTA_DOWN_FG }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {deltaPercent >= 0 ? '+' : '−'}
                          {Math.abs(Math.round(deltaPercent))}% vs. {PERIOD_COMPARISON_LABEL[period]}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/*
                    Barras em flexbox puro (nao react-native-chart-kit) —
                    mesma decisao ja tomada em Sono/FC: da controle total
                    pra posicionar a linha tracejada da media exatamente na
                    altura certa, sem lutar com o padding interno de uma lib
                    de grafico. Altura de cada barra = valor/maxValue do
                    periodo (barra do valor maximo em cor solida, as demais
                    num tom mais claro — hexToRgba com opacidade reduzida).
                  */}
                  <View style={styles.chartArea}>
                    <View
                      style={[
                        styles.avgLine,
                        { bottom: history.average != null ? `${Math.min(100, (history.average / maxValue) * 100)}%` : 0 },
                      ]}
                    />
                    {daily.map((point) => {
                      const value = point.value ?? 0;
                      const isPeak = value > 0 && value === maxValue;
                      const heightPct = Math.max(4, (value / maxValue) * 100);
                      return (
                        <View key={point.date} style={styles.barSlot}>
                          {isPeak && (
                            <Text style={styles.barCap} numberOfLines={1}>
                              {config.formatValue(value)}
                            </Text>
                          )}
                          <View
                            style={[
                              styles.bar,
                              {
                                height: `${heightPct}%`,
                                backgroundColor: isPeak ? config.color : hexToRgba(config.color, 0.35),
                              },
                            ]}
                          />
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.chartDayLabelsRow}>
                    {daily.map((point) => (
                      <Text key={point.date} style={styles.chartDayLabel}>
                        {formatBucketLabel(point.date, history.granularity)}
                      </Text>
                    ))}
                  </View>
                </View>

                <View style={styles.dayList}>
                  {daily.map((point, index) => (
                    <View
                      key={point.date}
                      style={[styles.dayRow, index === daily.length - 1 && styles.dayRowLast]}
                    >
                      <Text style={styles.dayNumber}>{formatBucketLabel(point.date, history.granularity)}</Text>
                      {history.granularity === 'day' && (
                        <Text style={styles.dayWeekday}>{formatWeekdayLabel(point.date)}</Text>
                      )}
                      <View style={styles.dayBarTrack}>
                        <View
                          style={[
                            styles.dayBarFill,
                            { width: `${Math.round(((point.value ?? 0) / maxValue) * 100)}%`, backgroundColor: config.color },
                          ]}
                        />
                      </View>
                      <Text style={styles.dayValue}>
                        {point.value != null ? `${config.formatValue(point.value)} ${config.unitLabel}` : '--'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </GlassCard>
        )}
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  headerDot: { width: 8, height: 8, borderRadius: 3 },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.lg, paddingBottom: spacing3.xl },

  // A partir daqui — card/periodRow/navRow/averageCard/chart/dayList — SO
  // renderiza pra Passos/Calorias (Sono/FC retornam antes, via seus
  // proprios componentes SleepDetailView/HeartRateDetailView, que tem seu
  // proprio StyleSheet colors3 importado independentemente).
  card: { gap: spacing3.md },
  error: { color: colors3.error, textAlign: 'center', marginTop: spacing3.xl },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginTop: spacing3.xl },

  connectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing3.xl,
  },
  connectHintText: { ...typography3.bodyMd, color: colors3.primary, fontWeight: '700' },

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

  readyContent: { gap: spacing3.md },

  averageCard: {
    borderRadius: radius3.lg,
    padding: spacing3.md,
    backgroundColor: colors3.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  averageEyebrow: {
    ...typography3.labelSm,
    fontSize: 10,
    letterSpacing: 1,
    color: colors3.onSurfaceVariant,
    marginBottom: spacing3.sm,
  },
  averageRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: spacing3.lg, flexWrap: 'wrap' },
  // BUG 1 (numero com glitch/sobreposto), historico — causa raiz: esta
  // regra fazia `...typography2.metricMono` (fontSize base 20, lineHeight
  // 24) e so sobrescrevia fontSize pra 38, deixando lineHeight=24 MENOR
  // que o fontSize=38. Com a caixa da linha mais baixa que o glifo, o
  // proprio texto se desenhava "espremido"/sobreposto verticalmente — nao
  // eram 2 Text nem fonte nao carregada. Corrigido na epoca com
  // fontSize/lineHeight proporcionais (mantido aqui). fontFamily migrado
  // de JetBrains Mono pra Inter nesta tarefa (decisao deliberada) — o
  // letterSpacing -2.2 do mockup era calibrado pros glifos de largura
  // fixa do Mono; usando typography3.headlineLg (-0.32) em vez disso pra
  // nao ficar cramped com Inter proporcional.
  averageValue: {
    ...typography3.headlineLg,
    fontSize: 44,
    lineHeight: 48,
    color: colors3.onSurface,
  },
  averageUnit: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  // BUG 2 (badge cortado na borda) — causa raiz: `marginLeft:'auto'` numa
  // row sem `flexWrap` e sem `flexShrink` no badge — com o numero grande
  // (ex: "15.215") ja ocupando a maior parte da largura, nao sobrava
  // espaco pro badge, que simplesmente estourava a borda direita do card
  // (LiquiglassCard/GlassCard corta overflow). Corrigido em 2 frentes:
  // `averageRow` ganhou `flexWrap:'wrap'` (o badge cai pra proxima linha
  // se realmente nao couber, em vez de estourar), e o badge ganhou
  // `flexShrink:1`/`minWidth:0` + o texto ganhou `numberOfLines`/
  // `adjustsFontSizeToFit` (mesmo padrao ja usado nos tiles de
  // HealthMetricsGrid) — encolhe a fonte antes de cortar, nunca extrapola.
  deltaBadge: {
    marginLeft: 'auto',
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: spacing3.sm,
    paddingVertical: 4,
    borderRadius: radius3.pill,
  },
  deltaBadgeText: { ...typography3.labelSm, textTransform: 'none', fontSize: 11, fontWeight: '700' },

  // Altura fixa (nao flex:1 num pai sem altura definida) — barras dentro
  // usam height:'%' relativo a ISSO, precisa de um numero de referencia.
  chartArea: { position: 'relative', height: 132, flexDirection: 'row', alignItems: 'flex-end', gap: spacing3.xs },
  avgLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderTopColor: colors3.outlineVariant,
    borderStyle: 'dashed',
  },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barCap: { fontFamily: INTER_BOLD, fontSize: 9, lineHeight: 12, color: colors3.onSurfaceVariant, marginBottom: 4 },
  bar: { width: '100%', borderRadius: radius3.sm },
  chartDayLabelsRow: { flexDirection: 'row', gap: spacing3.xs, marginTop: spacing3.xs },
  chartDayLabel: {
    fontFamily: INTER_BOLD,
    fontSize: 10,
    lineHeight: 13,
    color: colors3.onSurfaceVariant,
    textAlign: 'center',
    flex: 1,
  },

  dayList: { gap: 2 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    paddingVertical: spacing3.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors3.outlineVariant,
  },
  dayRowLast: { borderBottomWidth: 0 },
  dayNumber: { fontFamily: INTER_BOLD, fontSize: 15, lineHeight: 18, color: colors3.onSurface, width: 26 },
  dayWeekday: { ...typography3.bodyMd, fontSize: 12, color: colors3.onSurfaceVariant, width: 32 },
  dayBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors3.surfaceContainerHigh,
    overflow: 'hidden',
  },
  dayBarFill: { height: '100%', borderRadius: 3 },
  dayValue: {
    fontFamily: INTER_BOLD,
    fontSize: 13,
    lineHeight: 16,
    color: colors3.onSurface,
    fontWeight: '600',
    minWidth: 82,
    textAlign: 'right',
  },
});
