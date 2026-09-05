import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Svg, { Defs, LinearGradient, Line, Path, Circle, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/GlassCard';
import {
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  formatDistanceKm,
  formatDuration as formatActivityDuration,
  listManualActivities,
  listRuns,
} from '@/services/activities';
import {
  DayHeartRateDetail,
  HEALTH_SOURCE_LABEL,
  HEALTHKIT_CONNECTED_KEY,
  WeekHeartRateDetail,
  ensureHealthAuthorized,
  fetchAverageHeartRate,
  fetchDayHeartRateDetail,
  fetchSleepSessionDetail,
  fetchWeekHeartRateDetail,
  isHealthAvailable,
} from '@/services/health';
import { WorkoutSession, listWorkoutSessions } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// Migrado de JetBrains Mono pra Inter nesta tarefa -- decisao deliberada de
// consistencia com o resto do app (o mockup aprovado, Tryv FC e Sono.dc.html,
// pedia Mono aqui, mas o padrao virou Inter em todas as outras telas
// migradas). Mesmo ajuste feito em SleepDetailView.tsx.
const INTER_MEDIUM = 'Inter_600SemiBold';
const INTER_BOLD = 'Inter_700Bold';

// Cores exatas do mockup aprovado (Tryv FC e Sono.dc.html) pra esta tela
// especificamente — nao e metricColors.heartRate (#F87171, usado em
// outros lugares como HealthMetricsGrid) porque o mockup usa um tom rosa
// distinto (#FB7185) pra linha/area do grafico, com um vermelho mais
// saturado (#e5495f) so pro numero grande do "Pico".
const FC_LINE_COLOR = '#FB7185';
const FC_PEAK_TEXT_COLOR = '#e5495f';
const FC_REST_COLOR = '#38BDF8'; // == metricColors.distance, reaproveitado pra linha "Descansando" da semana

type Status = 'checking' | 'unavailable' | 'disconnected' | 'ready' | 'error';
type ViewMode = 'day' | 'week';

type MarkerType = 'run' | 'bike' | 'walk' | 'swim' | 'fight' | 'hiit' | 'other' | 'strength' | 'sleep';

interface ActivityMarker {
  key: string;
  type: MarkerType;
  label: string;
  subtitle: string;
  startedAt: string;
  /** Janela real pra media de FC — null quando ja temos o bpm pronto (sono, reaproveitado de fetchSleepSessionDetail) ou quando nao ha duracao conhecida. */
  window: { start: Date; end: Date } | null;
  bpmAvg: number | null;
  /** null quando ainda nao navegavel (so corridas/pedaladas com GPS tem tela de detalhe hoje). */
  runId: string | null;
}

const MARKER_ICONS: Record<MarkerType, React.ComponentProps<typeof Ionicons>['name']> = {
  run: 'walk',
  bike: 'bicycle',
  walk: 'footsteps',
  swim: 'water',
  fight: 'body',
  hiit: 'flame',
  other: 'fitness',
  strength: 'barbell',
  sleep: 'moon',
};

// Paleta por tipo de marcador — mesma logica do mockup (cada atividade
// carrega sua propria cor de fundo/icone): sono em indigo, cardio (corrida/
// pedalada/caminhada/natacao/HIIT) em ambar (== familia de metricColors.steps),
// forca/luta em roxo (== colors3.primary), "outro" em cinza neutro — so os
// 3 primeiros grupos tem exemplo explicito no mockup (sono/corrida/forca);
// os demais tipos foram agrupados por analogia (extensao minha, nao do mockup).
const MARKER_COLORS: Record<MarkerType, { iconBg: string; iconFg: string; pillBg: string; pillFg: string }> = {
  sleep: { iconBg: 'rgba(129,140,248,.16)', iconFg: '#4f46b8', pillBg: 'rgba(129,140,248,.13)', pillFg: '#3f3796' },
  run: { iconBg: 'rgba(245,165,36,.16)', iconFg: '#8a5a08', pillBg: 'rgba(245,165,36,.15)', pillFg: '#7a4f06' },
  bike: { iconBg: 'rgba(245,165,36,.16)', iconFg: '#8a5a08', pillBg: 'rgba(245,165,36,.15)', pillFg: '#7a4f06' },
  walk: { iconBg: 'rgba(245,165,36,.16)', iconFg: '#8a5a08', pillBg: 'rgba(245,165,36,.15)', pillFg: '#7a4f06' },
  swim: { iconBg: 'rgba(245,165,36,.16)', iconFg: '#8a5a08', pillBg: 'rgba(245,165,36,.15)', pillFg: '#7a4f06' },
  hiit: { iconBg: 'rgba(245,165,36,.16)', iconFg: '#8a5a08', pillBg: 'rgba(245,165,36,.15)', pillFg: '#7a4f06' },
  fight: { iconBg: 'rgba(107,56,212,.12)', iconFg: '#4c1fa8', pillBg: 'rgba(107,56,212,.11)', pillFg: '#4c1fa8' },
  strength: { iconBg: 'rgba(107,56,212,.12)', iconFg: '#4c1fa8', pillBg: 'rgba(107,56,212,.11)', pillFg: '#4c1fa8' },
  other: { iconBg: colors3.surfaceContainerHigh, iconFg: colors3.onSurfaceVariant, pillBg: colors3.surfaceContainerHigh, pillFg: colors3.onSurfaceVariant },
};

function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function startOfLocalDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfLocalDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(23, 59, 59, 999);
  return result;
}

function isSameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

/** Busca marcadores de atividade do dia: corrida/pedalada/caminhada/natacao (GPS) e luta/HIIT/outro (manual) do backend Tryv, treino de forca (workout_sessions) e a sessao de sono do HealthKit (so quando o dia visto e hoje). Ja resolve a janela real de cada atividade pra "bpm med." (fetchAverageHeartRate) — sono reaproveita o valor ja calculado por fetchSleepSessionDetail, sem consulta nova. */
async function fetchActivityMarkers(day: Date, isToday: boolean): Promise<ActivityMarker[]> {
  const dayStart = startOfLocalDay(day);
  const dayEnd = endOfLocalDay(day);

  const [runs, manualActivities, sessions, sleep] = await Promise.all([
    listRuns().catch(() => []),
    listManualActivities().catch(() => []),
    listWorkoutSessions(dayStart, dayEnd).catch(() => [] as WorkoutSession[]),
    isToday ? fetchSleepSessionDetail().catch(() => null) : Promise.resolve(null),
  ]);

  const markers: ActivityMarker[] = [];

  runs
    .filter((run) => isSameLocalDay(run.started_at, day))
    .forEach((run) => {
      // Corrida com GPS pode ter activity_type fora de run/bike/walk (ex:
      // natacao em aguas abertas importada do Apple Health, ver comentario
      // em RunCreatePayload) — usa o tipo real pro icone/rotulo.
      const type = (run.activity_type as ActivityType) in ACTIVITY_TYPE_LABELS ? (run.activity_type as ActivityType) : 'run';
      markers.push({
        key: `run-${run.id}`,
        type: type as MarkerType,
        label: ACTIVITY_TYPE_LABELS[type],
        subtitle: `${formatActivityDuration(run.duration_seconds)} · ${formatDistanceKm(run.distance_meters)} km`,
        startedAt: run.started_at,
        window: { start: new Date(run.started_at), end: new Date(run.finished_at) },
        bpmAvg: null,
        runId: run.id,
      });
    });

  manualActivities
    .filter((activity) => isSameLocalDay(activity.performed_at, day))
    .forEach((activity) => {
      const type = (activity.activity_type as ActivityType) in ACTIVITY_TYPE_LABELS ? (activity.activity_type as ActivityType) : 'other';
      const start = new Date(activity.performed_at);
      const end = new Date(start.getTime() + activity.duration_minutes * 60 * 1000);
      markers.push({
        key: `manual-${activity.id}`,
        type: type as MarkerType,
        label: ACTIVITY_TYPE_LABELS[type],
        subtitle: formatActivityDuration(activity.duration_minutes * 60),
        startedAt: activity.performed_at,
        window: { start, end },
        bpmAvg: null,
        runId: null,
      });
    });

  sessions.forEach((session) => {
    const focus = session.exercises?.focus;
    const end = new Date(session.completed_at);
    const start = session.duration_minutes != null ? new Date(end.getTime() - session.duration_minutes * 60 * 1000) : end;
    markers.push({
      key: `session-${session.id}`,
      type: 'strength',
      label: focus || 'Treino de força',
      subtitle: session.duration_minutes != null ? `${session.duration_minutes} min` : 'Duração não registrada',
      startedAt: session.completed_at,
      window: { start, end },
      bpmAvg: null,
      runId: null,
    });
  });

  if (sleep) {
    markers.push({
      key: 'sleep',
      type: 'sleep',
      label: 'Sono',
      subtitle: `${new Date(sleep.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — ${new Date(sleep.endedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      startedAt: sleep.startedAt,
      window: null, // reaproveita sleep.heartRate.average abaixo, sem consulta nova
      bpmAvg: sleep.heartRate.average,
      runId: null,
    });
  }

  // "bpm med." de cada atividade (exceto sono, que ja veio pronto) — mesma
  // tecnica ja usada pra "FC durante o sono" (fetchAverageHeartRate,
  // generalizada em services/healthkit.ts nesta tarefa).
  await Promise.all(
    markers.map(async (marker) => {
      if (!marker.window) return;
      marker.bpmAvg = await fetchAverageHeartRate(marker.window.start, marker.window.end).catch(() => null);
    })
  );

  return markers.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** left:'x%' + shift de borda (mesma logica do mockup: perto do fim do dia alinha pela direita, perto da meia-noite nao desloca, resto centraliza). */
function markerPosition(startMin: number): { left: `${number}%`; translateX: number | `${number}%` } {
  const left: `${number}%` = `${(startMin / 1440) * 100}%`;
  if (startMin > 1080) return { left, translateX: '-100%' };
  if (startMin < 180) return { left, translateX: 0 };
  return { left, translateX: '-50%' };
}

function buildLinePath(values: number[], width: number, height: number, lo: number, hi: number): string {
  const range = Math.max(hi - lo, 1);
  const px = (i: number) => (values.length <= 1 ? width / 2 : (i / (values.length - 1)) * width);
  const py = (v: number) => height - ((v - lo) / range) * height;
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
}

/**
 * Detalhe completo de Frequencia cardiaca — visao "1 dia" (linha continua +
 * marcadores de atividade + lista) e "7 dias" (2 linhas — repouso e pico —
 * + lista semanal). Reconstruido do zero seguindo o mockup aprovado (Tryv
 * FC e Sono.dc.html), tema "prism-glass" claro (colors3/GlassCard) —
 * migracao pedida explicitamente, FC deixa de ser tema escuro.
 *
 * TODA a logica de dado e reaproveitada de services/healthkit.ts
 * (fetchDayHeartRateDetail/fetchWeekHeartRateDetail) e services/activities.ts
 * + services/workouts.ts (marcadores) — so a camada visual foi reescrita.
 * Unica adicao de dado nesta tarefa: "bpm med." por atividade
 * (fetchAverageHeartRate, nova mas generalizada da mesma tecnica ja usada
 * pra FC-durante-o-sono).
 */
export function HeartRateDetailView() {
  const [status, setStatus] = useState<Status>('checking');
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [offset, setOffset] = useState(0);
  const [dayDetail, setDayDetail] = useState<DayHeartRateDetail | null>(null);
  const [weekDetail, setWeekDetail] = useState<WeekHeartRateDetail | null>(null);
  const [markers, setMarkers] = useState<ActivityMarker[]>([]);

  const load = useCallback(async () => {
    // iOS -> Apple HealthKit, Android -> Health Connect (ver services/health.ts).
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
      const authorized = await ensureHealthAuthorized();
      if (!authorized) {
        setStatus('disconnected');
        return;
      }
      await SecureStore.setItemAsync(HEALTHKIT_CONNECTED_KEY, 'true');

      if (viewMode === 'day') {
        const day = new Date();
        day.setDate(day.getDate() - offset);
        const [detail, activityMarkers] = await Promise.all([
          fetchDayHeartRateDetail(offset),
          fetchActivityMarkers(day, offset === 0),
        ]);
        setDayDetail(detail);
        setMarkers(activityMarkers);
      } else {
        setWeekDetail(await fetchWeekHeartRateDetail(offset));
      }
      setStatus('ready');
    } catch (err) {
      console.error('[HeartRateDetailView] falha ao buscar detalhe de FC:', err);
      setStatus('error');
    }
  }, [viewMode, offset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleChangeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setOffset(0);
  };

  if (status === 'checking') {
    return <ActivityIndicator color={colors3.primary} style={styles.loading} />;
  }

  if (status === 'unavailable') {
    return (
      <Text style={styles.emptyText}>
        {Platform.OS === 'android'
          ? 'Instale ou atualize o app Health Connect pra ver sua frequencia cardiaca aqui.'
          : 'Historico de saude disponivel so no iPhone, via Apple Health.'}
      </Text>
    );
  }

  if (status === 'disconnected') {
    return (
      <Pressable style={styles.connectHint} onPress={() => router.push('/activity')} hitSlop={8}>
        <Text style={styles.connectHintText}>Nenhum dado sincronizado ainda. Conectar {HEALTH_SOURCE_LABEL}</Text>
        <Ionicons name="chevron-forward" size={14} color={colors3.primary} />
      </Pressable>
    );
  }

  if (status === 'error') {
    return <Text style={styles.error}>Nao foi possivel carregar a frequencia cardiaca.</Text>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modePill, viewMode === 'day' && styles.modePillSelected]}
          onPress={() => handleChangeViewMode('day')}
        >
          <Text style={[styles.modePillText, viewMode === 'day' && styles.modePillTextSelected]}>Dia</Text>
        </Pressable>
        <Pressable
          style={[styles.modePill, viewMode === 'week' && styles.modePillSelected]}
          onPress={() => handleChangeViewMode('week')}
        >
          <Text style={[styles.modePillText, viewMode === 'week' && styles.modePillTextSelected]}>Semana</Text>
        </Pressable>
      </View>

      <View style={styles.navRow}>
        <Pressable onPress={() => setOffset((prev) => prev + 1)} hitSlop={8} style={styles.navArrow}>
          <Ionicons name="chevron-back" size={20} color={colors3.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.navLabel}>
          {viewMode === 'day'
            ? offset === 0
              ? 'Hoje'
              : new Date(dayDetail?.date ? `${dayDetail.date}T00:00:00` : Date.now()).toLocaleDateString('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                })
            : weekDetail
              ? `${new Date(`${weekDetail.days[0].date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${new Date(`${weekDetail.days[6].date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
              : ''}
        </Text>
        <Pressable
          onPress={() => setOffset((prev) => Math.max(0, prev - 1))}
          hitSlop={8}
          style={styles.navArrow}
          disabled={offset === 0}
        >
          <Ionicons name="chevron-forward" size={20} color={offset === 0 ? colors3.outlineVariant : colors3.onSurfaceVariant} />
        </Pressable>
      </View>

      {viewMode === 'day' && dayDetail && <DayChartCard detail={dayDetail} markers={markers} />}

      {viewMode === 'day' && (
        <View style={styles.activityList}>
          <Text style={styles.sectionTitle}>Atividades do dia</Text>
          {markers.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma atividade registrada neste dia.</Text>
          ) : (
            <GlassCard variant="glass" style={styles.listCard}>
              {markers.map((marker, index) => {
                const colorSet = MARKER_COLORS[marker.type];
                const Row = marker.runId ? Pressable : View;
                return (
                  <Row
                    key={marker.key}
                    style={[styles.activityRow, index === markers.length - 1 && styles.activityRowLast]}
                    {...(marker.runId
                      ? { onPress: () => router.push({ pathname: '/activity/[id]', params: { id: marker.runId! } }) }
                      : {})}
                  >
                    <View style={[styles.activityIconWrap, { backgroundColor: colorSet.iconBg }]}>
                      <Ionicons name={MARKER_ICONS[marker.type]} size={15} color={colorSet.iconFg} />
                    </View>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityName}>{marker.label}</Text>
                      <Text style={styles.activitySubtitle}>{marker.subtitle}</Text>
                    </View>
                    <View style={styles.activityBpmWrap}>
                      <Text style={styles.activityBpmValue}>{marker.bpmAvg ?? '--'}</Text>
                      <Text style={styles.activityBpmLabel}>bpm méd.</Text>
                    </View>
                  </Row>
                );
              })}
            </GlassCard>
          )}
        </View>
      )}

      {viewMode === 'week' && weekDetail && <WeekChartCard detail={weekDetail} />}

      {viewMode === 'week' && weekDetail && (
        <View style={styles.activityList}>
          <Text style={styles.sectionTitle}>Dias da semana</Text>
          <GlassCard variant="glass" style={styles.listCard}>
            {weekDetail.days.map((d, index) => (
              <View
                key={d.date}
                style={[styles.weekDayRow, index === weekDetail.days.length - 1 && styles.activityRowLast]}
              >
                <Text style={styles.weekDayLabel}>
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '')}
                </Text>
                <View style={styles.weekDayValueWrap}>
                  <View style={[styles.weekDayDot, { backgroundColor: FC_REST_COLOR }]} />
                  <Text style={styles.weekDayValueText}>{d.restingBpm ?? '--'} rep.</Text>
                </View>
                <View style={styles.weekDayValueWrap}>
                  <View style={[styles.weekDayDot, { backgroundColor: FC_LINE_COLOR }]} />
                  <Text style={[styles.weekDayValueText, styles.weekDayValueTextPeak]}>{d.peakBpm ?? '--'} pico</Text>
                </View>
              </View>
            ))}
          </GlassCard>
        </View>
      )}
    </View>
  );
}

/** Card com o resumo Descansando/Pico + linha continua de 1 dia + marcadores de atividade — extraido do componente principal so pra isolar a matematica do SVG. */
function DayChartCard({ detail, markers }: { detail: DayHeartRateDetail; markers: ActivityMarker[] }) {
  const values = detail.points.map((p) => p.bpm);
  const hasData = values.length > 0;
  const lo = hasData ? Math.min(...values) : 0;
  const hi = hasData ? Math.max(...values) : 0;
  const CHART_W = 320;
  const CHART_H = 132;
  const linePath = hasData ? buildLinePath(values, CHART_W, CHART_H, lo, hi) : '';
  const areaPath = hasData ? `${linePath} L${CHART_W},${CHART_H} L0,${CHART_H} Z` : '';

  return (
    <GlassCard variant="glass" style={styles.card}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <View style={styles.summaryValueRow}>
            <Text style={styles.summaryValue}>{detail.restingBpm ?? '--'}</Text>
            <Text style={styles.summaryUnit}>bpm</Text>
          </View>
          <Text style={styles.summaryLabel}>Descansando</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={styles.summaryValueRow}>
            <Text style={[styles.summaryValue, { color: FC_PEAK_TEXT_COLOR }]}>{detail.peakBpm ?? '--'}</Text>
            <Text style={styles.summaryUnit}>bpm</Text>
          </View>
          <Text style={styles.summaryLabel}>Pico</Text>
        </View>
      </View>

      {hasData ? (
        <>
          <View style={styles.chartWrap}>
            <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={FC_LINE_COLOR} stopOpacity={0.28} />
                  <Stop offset="100%" stopColor={FC_LINE_COLOR} stopOpacity={0.02} />
                </LinearGradient>
              </Defs>
              {[0.15, 0.4, 0.65, 0.9].map((frac) => (
                <Line
                  key={frac}
                  x1={0}
                  y1={CHART_H * frac}
                  x2={CHART_W}
                  y2={CHART_H * frac}
                  stroke={colors3.surfaceContainerHigh}
                  strokeWidth={1}
                />
              ))}
              <Path d={areaPath} fill="url(#fcFill)" />
              <Path d={linePath} fill="none" stroke={FC_LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
            <Text style={[styles.chartAxisLabel, { top: 0 }]}>{hi}</Text>
            <Text style={[styles.chartAxisLabel, { top: CHART_H - 12 }]}>{lo}</Text>
          </View>

          <View style={styles.hourLabelsRow}>
            <Text style={styles.hourLabelText}>00h</Text>
            <Text style={styles.hourLabelText}>06h</Text>
            <Text style={styles.hourLabelText}>12h</Text>
            <Text style={styles.hourLabelText}>18h</Text>
            <Text style={styles.hourLabelText}>24h</Text>
          </View>

          {markers.length > 0 && (
            <View style={styles.markersTrack}>
              {markers.map((marker) => {
                const colorSet = MARKER_COLORS[marker.type];
                const { left, translateX } = markerPosition(minutesSinceMidnight(marker.startedAt));
                return (
                  <View
                    key={marker.key}
                    style={[
                      styles.markerPill,
                      { left, backgroundColor: colorSet.pillBg, transform: [{ translateX }] },
                    ]}
                  >
                    <View style={[styles.markerDot, { backgroundColor: colorSet.iconFg }]}>
                      <Ionicons name={MARKER_ICONS[marker.type]} size={8} color="#fcf9f8" />
                    </View>
                    <Text style={[styles.markerText, { color: colorSet.pillFg }]} numberOfLines={1}>
                      {marker.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <Text style={styles.emptyText}>Sem leituras de FC neste dia.</Text>
      )}
    </GlassCard>
  );
}

/** Card com o resumo Méd. repouso/Média-alto + 2 linhas (repouso/pico) da semana. */
function WeekChartCard({ detail }: { detail: WeekHeartRateDetail }) {
  const restValues = detail.days.map((d) => d.restingBpm ?? 0);
  const peakValues = detail.days.map((d) => d.peakBpm ?? 0);
  const allValues = [...restValues, ...peakValues].filter((v) => v > 0);
  const lo = allValues.length ? Math.min(...allValues) - 8 : 40;
  const hi = allValues.length ? Math.max(...allValues) + 8 : 160;
  const CHART_W = 300;
  const CHART_H = 108;

  const restPath = buildLinePath(restValues, CHART_W, CHART_H, lo, hi);
  const peakPath = buildLinePath(peakValues, CHART_W, CHART_H, lo, hi);
  const px = (i: number) => (detail.days.length <= 1 ? CHART_W / 2 : (i / (detail.days.length - 1)) * CHART_W);
  const py = (v: number) => CHART_H - ((v - lo) / Math.max(hi - lo, 1)) * CHART_H;

  const axisTicks = [hi, lo + (hi - lo) * 0.66, lo + (hi - lo) * 0.33, lo].map((v) => Math.round(v));

  return (
    <GlassCard variant="glass" style={styles.card}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <View style={styles.summaryValueRow}>
            <Text style={styles.summaryValue}>{detail.avgRestingBpm ?? '--'}</Text>
            <Text style={styles.summaryUnit}>bpm</Text>
          </View>
          <Text style={styles.summaryLabel}>Méd. repouso</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={styles.summaryValueRow}>
            <Text style={[styles.summaryValue, { color: FC_PEAK_TEXT_COLOR }]}>{detail.avgPeakBpm ?? '--'}</Text>
            <Text style={styles.summaryUnit}>bpm</Text>
          </View>
          <Text style={styles.summaryLabel}>Média-alto</Text>
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: FC_REST_COLOR }]} />
          <Text style={styles.legendText}>Descansando</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: FC_LINE_COLOR }]} />
          <Text style={styles.legendText}>Pico</Text>
        </View>
      </View>

      <View style={styles.weekChartRow}>
        <View style={styles.weekAxisCol}>
          {axisTicks.map((tick, i) => (
            <Text key={i} style={styles.chartAxisLabelStatic}>
              {tick}
            </Text>
          ))}
        </View>
        <View style={styles.weekChartArea}>
          <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
            {[0.05, 0.37, 0.69, 1].map((frac) => (
              <Line
                key={frac}
                x1={0}
                y1={CHART_H * frac}
                x2={CHART_W}
                y2={CHART_H * frac}
                stroke={colors3.surfaceContainerHigh}
                strokeWidth={1}
              />
            ))}
            <Path d={restPath} fill="none" stroke={FC_REST_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            <Path d={peakPath} fill="none" stroke={FC_LINE_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {detail.days.map((d, i) => (
              <React.Fragment key={`dots-${i}`}>
                {d.restingBpm != null && (
                  <Circle cx={px(i)} cy={py(d.restingBpm)} r={3.4} fill={colors3.background} stroke={FC_REST_COLOR} strokeWidth={2.2} />
                )}
                {d.peakBpm != null && (
                  <Circle cx={px(i)} cy={py(d.peakBpm)} r={3.4} fill={colors3.background} stroke={FC_LINE_COLOR} strokeWidth={2.2} />
                )}
              </React.Fragment>
            ))}
          </Svg>
          <View style={styles.weekLabelsRow}>
            {detail.days.map((d) => (
              <Text key={d.date} style={styles.weekChartLabel}>
                {new Date(`${d.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: spacing3.lg },
  error: { color: colors3.error, textAlign: 'center', marginTop: spacing3.xl },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginTop: spacing3.md },
  connectHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing3.xl },
  connectHintText: { ...typography3.bodyMd, color: colors3.primary, fontWeight: '700' },

  container: { gap: spacing3.md },
  modeRow: { flexDirection: 'row', gap: spacing3.xs },
  modePill: {
    flex: 1,
    paddingVertical: spacing3.sm - 2,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
  },
  modePillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  modePillText: { ...typography3.labelSm, fontSize: 12 },
  modePillTextSelected: { color: colors3.white, fontWeight: '700' },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navLabel: { ...typography3.bodyMd, fontWeight: '600', textAlign: 'center', flex: 1, color: colors3.onSurface },

  card: { gap: spacing3.sm },
  summaryRow: { flexDirection: 'row', gap: spacing3.lg, marginBottom: spacing3.xs },
  summaryItem: { flex: 1 },
  summaryValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  // letterSpacing padrao de typography3.headlineLg (-0.32) em vez do -2
  // antigo -- aquele valor era calibrado pros glifos de largura fixa do
  // JetBrains Mono, cramped/errado agora que o texto e Inter proporcional.
  summaryValue: { ...typography3.headlineLg, fontSize: 38, color: colors3.onSurface },
  summaryUnit: { fontFamily: INTER_MEDIUM, fontSize: 12, color: colors3.onSurfaceVariant },
  summaryLabel: { ...typography3.bodyMd, fontSize: 11, color: colors3.onSurfaceVariant, marginTop: 4 },

  chartWrap: { position: 'relative', marginTop: spacing3.xs },
  chartAxisLabel: {
    position: 'absolute',
    left: -2,
    fontFamily: INTER_MEDIUM,
    fontSize: 9,
    color: colors3.outline,
  },
  chartAxisLabelStatic: { fontFamily: INTER_MEDIUM, fontSize: 9, color: colors3.outline },

  hourLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing3.xs },
  hourLabelText: { fontFamily: INTER_MEDIUM, fontSize: 9, color: colors3.onSurfaceVariant },

  markersTrack: {
    position: 'relative',
    height: 30,
    marginTop: spacing3.sm,
    borderTopWidth: 1,
    borderTopColor: colors3.surfaceContainerHigh,
    paddingTop: spacing3.sm - 1,
  },
  markerPill: {
    position: 'absolute',
    top: spacing3.sm - 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingRight: 9,
    paddingLeft: 3,
    borderRadius: radius3.pill,
    maxWidth: 160,
  },
  markerDot: { width: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  markerText: { fontFamily: INTER_MEDIUM, fontSize: 9 },

  sectionTitle: { ...typography3.bodyMd, fontSize: 13, fontWeight: '700', color: colors3.onSurface, marginHorizontal: 4 },
  listCard: { padding: 0, gap: 0 },
  activityList: { gap: spacing3.sm },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    paddingVertical: 13,
    paddingHorizontal: spacing3.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors3.surfaceContainerHigh,
  },
  activityRowLast: { borderBottomWidth: 0 },
  activityIconWrap: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  activityInfo: { flex: 1, gap: 1 },
  activityName: { ...typography3.bodyMd, fontSize: 13, fontWeight: '600', color: colors3.onSurface },
  activitySubtitle: { fontFamily: INTER_MEDIUM, fontSize: 11, color: colors3.onSurfaceVariant },
  activityBpmWrap: { alignItems: 'flex-end' },
  activityBpmValue: { fontFamily: INTER_BOLD, fontSize: 13, color: colors3.onSurface },
  activityBpmLabel: {
    fontFamily: INTER_MEDIUM,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors3.onSurfaceVariant,
  },

  legendRow: { flexDirection: 'row', gap: spacing3.md, marginBottom: spacing3.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 16, height: 3, borderRadius: 2 },
  legendText: { ...typography3.bodyMd, fontSize: 10, color: colors3.onSurfaceVariant },

  weekChartRow: { flexDirection: 'row', gap: spacing3.sm },
  weekAxisCol: { justifyContent: 'space-between', height: 108, paddingBottom: 4 },
  weekChartArea: { flex: 1 },
  weekLabelsRow: { flexDirection: 'row', marginTop: spacing3.xs },
  weekChartLabel: { flex: 1, textAlign: 'center', fontFamily: INTER_MEDIUM, fontSize: 9, color: colors3.onSurfaceVariant },

  weekDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing3.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors3.surfaceContainerHigh,
  },
  weekDayLabel: { ...typography3.bodyMd, fontSize: 12, fontWeight: '600', flex: 1, color: colors3.onSurface },
  weekDayValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 74, justifyContent: 'flex-end' },
  weekDayDot: { width: 7, height: 7, borderRadius: 4 },
  weekDayValueText: { fontFamily: INTER_BOLD, fontSize: 12, color: colors3.onSurfaceVariant },
  weekDayValueTextPeak: { color: colors3.onSurface },
});
