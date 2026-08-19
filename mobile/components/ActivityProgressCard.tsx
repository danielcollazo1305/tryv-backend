import React, { useCallback, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { router, useFocusEffect } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { getApiErrorMessage } from '@/services/api';
import {
  ProgressGranularity,
  ProgressPeriod,
  RunProgress,
  WorkoutProgress,
  getRunProgress,
  getWorkoutProgress,
} from '@/services/dashboard';
import { colors2, metricColors, radius2, spacing2, typography2 } from '@/constants/theme';

type Tab = 'run' | 'workout';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing2.lg * 4;
const MIN_BAR_SLOT = 34;

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'run', label: 'Corrida' },
  { value: 'workout', label: 'Musculação' },
];

const PERIOD_OPTIONS: { value: ProgressPeriod; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

// Cor por aba, reaproveitando tokens que ja existem no app em vez de
// inventar hex novo — laranja de metricColors.steps (mesmo tom do tile de
// Passos do HealthMetricsGrid) pra Corrida, roxo (colors2.violet, cor de
// acao padrao do app) pra Musculacao.
const TAB_COLOR: Record<Tab, string> = {
  run: metricColors.steps,
  workout: colors2.violet,
};

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Dia da semana (granularity='day') ou dia-do-mes do inicio do bucket (granularity='week') — mesma logica de rotulo curto usada no resto do app (WeeklyActivityChart/MealsHistoryCard). */
function formatBucketLabel(dateStr: string, granularity: ProgressGranularity): string {
  const date = parseLocalDate(dateStr);
  if (granularity === 'week') return String(date.getDate());
  return WEEKDAY_LABELS[date.getDay()];
}

/** As cores de metrica sao hex fixo (#RRGGBB) — mesmo utilitario usado em HealthMetricsGrid/HealthWeeklyBarChart. */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

interface StatTileProps {
  label: string;
  value: string;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/**
 * Card de progresso da Home, estilo Strava — substitui o antigo "Km
 * rodados" (que continua existindo como WeeklyActivityChart, ainda usado
 * em social/[userId].tsx pro perfil publico de outra pessoa, por isso nao
 * foi tocado). Duas abas (Corrida/Musculacao), estatisticas fixas da
 * semana atual, toggle Semanal (picos diarios) / Mensal (picos semanais,
 * 12 semanas) pro grafico.
 *
 * Musculacao nao tem Tempo/Calorias reais (workout_sessions.duration_minutes/
 * calories_burned existem como coluna mas nenhum fluxo do app preenche
 * isso hoje — falta um cronometro na tela de treino, ver investigacao) —
 * as 3 estatisticas viraram Treinos/Series/Volume, decisao tomada com o
 * usuario, tudo derivado do que de fato e gravado nas series completadas
 * de cada sessao.
 */
export function ActivityProgressCard() {
  const [tab, setTab] = useState<Tab>('run');
  const [period, setPeriod] = useState<ProgressPeriod>('weekly');
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [workoutProgress, setWorkoutProgress] = useState<WorkoutProgress | null>(null);
  // Mensagem real do erro (nao so um boolean) — mesma convencao usada no
  // resto do app (getApiErrorMessage) pra distinguir 404/500/rede em vez
  // de um "nao foi possivel" generico que esconde a causa. Logada tambem
  // no console pra depuracao (Metro/logs do device).
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    try {
      if (tab === 'run') {
        setRunProgress(await getRunProgress(period));
      } else {
        setWorkoutProgress(await getWorkoutProgress(period));
      }
    } catch (err) {
      console.error('ActivityProgressCard: falha ao buscar progresso', err);
      setErrorMessage(getApiErrorMessage(err, 'Não foi possível carregar seu progresso.'));
    }
  }, [tab, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const color = TAB_COLOR[tab];
  const progress = tab === 'run' ? runProgress : workoutProgress;
  const chart = progress?.chart ?? [];
  const chartWidth = Math.max(CHART_WIDTH, chart.length * MIN_BAR_SLOT);

  return (
    <LiquiglassCard style={styles.card}>
      <View style={styles.tabRow}>
        {TAB_OPTIONS.map((option) => {
          const selected = option.value === tab;
          return (
            <Pressable
              key={option.value}
              onPress={() => setTab(option.value)}
              style={[styles.tabPill, selected && { backgroundColor: TAB_COLOR[option.value], borderColor: TAB_COLOR[option.value] }]}
            >
              <Text style={[styles.tabPillText, selected && styles.tabPillTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Esta semana</Text>

      {tab === 'run' ? (
        <View style={styles.statsRow}>
          <StatTile label="Distância" value={runProgress ? `${runProgress.distance_km.toFixed(1)} km` : '--'} />
          <StatTile label="Tempo" value={runProgress ? `${Math.round(runProgress.duration_minutes)} min` : '--'} />
          <StatTile
            label="Ganho de elev."
            value={runProgress ? `${Math.round(runProgress.elevation_gain_m)} m` : '--'}
          />
        </View>
      ) : (
        <View style={styles.statsRow}>
          <StatTile label="Treinos" value={workoutProgress ? `${workoutProgress.sessions_count}` : '--'} />
          <StatTile label="Séries" value={workoutProgress ? `${workoutProgress.sets_count}` : '--'} />
          <StatTile label="Volume" value={workoutProgress ? `${Math.round(workoutProgress.volume_kg)} kg` : '--'} />
        </View>
      )}

      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((option) => {
          const selected = option.value === period;
          return (
            <Pressable
              key={option.value}
              onPress={() => setPeriod(option.value)}
              style={[styles.periodPill, selected && styles.periodPillSelected]}
            >
              <Text style={[styles.periodPillText, selected && styles.periodPillTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {errorMessage ? (
        <Text style={styles.emptyText}>{errorMessage}</Text>
      ) : !progress ? (
        <Text style={styles.emptyText}>Carregando...</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <LineChart
            data={{
              labels: chart.map((point) => formatBucketLabel(point.date, progress.granularity)),
              datasets: [{ data: chart.map((point) => point.value) }],
            }}
            width={chartWidth}
            height={180}
            bezier
            fromZero
            withInnerLines={false}
            withOuterLines={false}
            segments={4}
            chartConfig={{
              backgroundGradientFrom: colors2.surfaceContainer,
              backgroundGradientTo: colors2.surfaceContainer,
              decimalPlaces: 1,
              color: (opacity = 1) => hexToRgba(color, opacity),
              labelColor: () => colors2.onSurfaceVariant,
              propsForDots: { r: '3', strokeWidth: '2', stroke: color },
              propsForBackgroundLines: { stroke: colors2.outlineVariant },
              propsForLabels: { fontSize: 10 },
            }}
            style={styles.chart}
          />
        </ScrollView>
      )}

      <Button2 label="Veja mais do seu progresso" variant="secondary" onPress={() => router.push('/activity')} />
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md },

  tabRow: { flexDirection: 'row', gap: spacing2.xs },
  tabPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing2.sm,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  tabPillText: { ...typography2.bodyMd, fontSize: 14, textAlign: 'center', color: colors2.onSurface },
  tabPillTextSelected: { color: colors2.white, fontWeight: '700' },

  sectionTitle: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statTile: { alignItems: 'flex-start', gap: 2 },
  statLabel: { ...typography2.labelCaps, fontSize: 10, textTransform: 'none', color: colors2.onSurfaceVariant },
  statValue: { ...typography2.metricMono, fontSize: 20 },

  periodRow: { flexDirection: 'row', gap: spacing2.xs },
  periodPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing2.sm - 2,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  periodPillSelected: { backgroundColor: colors2.violet, borderColor: colors2.violet },
  periodPillText: { ...typography2.labelCaps, fontSize: 11, textAlign: 'center' },
  periodPillTextSelected: { color: colors2.white, fontWeight: '700' },

  emptyText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },

  chart: { borderRadius: radius2.md, marginLeft: -spacing2.md },
});
