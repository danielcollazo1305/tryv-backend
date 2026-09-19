import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { ActivityProgressChart, ActivityProgressStats } from '@/components/ActivityProgressChart';
import {
  PERIOD_DAYS,
  PERIOD_OPTIONS,
  TAB_COLOR,
  TAB_OPTIONS,
  formatDistance,
  useActivityProgress,
} from '@/components/useActivityProgress';
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  Run,
  formatActivityDate,
  formatDistanceKm,
  formatDuration,
  listRuns,
  parseUtcDate,
} from '@/services/activities';
import { WorkoutSession, listWorkoutSessions } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/** Corte de data da janela do periodo selecionado — identico ao que o backend usa pro grafico (ver PERIOD_DAYS em useActivityProgress.ts), pra lista e grafico mostrarem sempre a mesma janela de tempo. */
function periodCutoff(days: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

/** Mesma logica de backend/app/routers/dashboard.py:_session_stats -- series completas + volume (kg) de uma sessao, derivados do JSON livre de exercicios (unica fonte real, ver comentario la). */
function sessionStats(session: WorkoutSession): { setsCount: number; volumeKg: number } {
  const exercises = session.exercises?.exercises ?? [];
  let setsCount = 0;
  let volumeKg = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.completed) continue;
      setsCount += 1;
      if (set.weight_kg != null && set.reps != null) {
        volumeKg += set.weight_kg * set.reps;
      }
    }
  }
  return { setsCount, volumeKg };
}

function RunRow({ run }: { run: Run }) {
  const activityType = run.activity_type as ActivityType;
  const label = ACTIVITY_TYPE_LABELS[activityType] ?? run.activity_type;
  const icon = ACTIVITY_TYPE_ICONS[activityType] ?? 'body';
  const stats = `${formatDistanceKm(run.distance_meters)} km  •  ${formatDuration(run.duration_seconds)}`;

  return (
    <Pressable onPress={() => router.push({ pathname: '/activity/[id]', params: { id: run.id, kind: 'run' } })}>
      <GlassCard variant="card" style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={colors3.primary} />
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowDate}>{formatActivityDate(run.started_at)}</Text>
          </View>
          <Text style={styles.rowStats}>{stats}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
      </GlassCard>
    </Pressable>
  );
}

/**
 * Sem onPress/chevron de proposito -- diferente de Run/ManualActivity,
 * WorkoutSession nao tem tela de detalhe hoje (app/activity/[id].tsx so
 * aceita kind 'run'|'manual', ver FeedEntry em app/activity/index.tsx).
 * Inventar uma rota pra isso e fora do escopo desta tarefa.
 */
function WorkoutSessionRow({ session }: { session: WorkoutSession }) {
  const { setsCount, volumeKg } = sessionStats(session);
  const label = session.exercises?.focus ?? 'Treino livre';
  const stats = `${setsCount} ${setsCount === 1 ? 'série' : 'séries'}  •  ${Math.round(volumeKg)} kg`;

  return (
    <GlassCard variant="card" style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name="barbell" size={20} color={colors3.primary} />
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowDate}>{formatActivityDate(session.completed_at)}</Text>
        </View>
        <Text style={styles.rowStats}>{stats}</Text>
      </View>
    </GlassCard>
  );
}

/**
 * Pagina cheia de progresso (Corrida/Musculacao) — destino dos tiles "Km
 * percorridos"/"Treinos concluidos" da Comparacao Mensal da Home, que
 * antes levavam pra /activity (lista crua, sem grafico nenhum, avaliado
 * como "muito superficial"). Reaproveita useActivityProgress.ts +
 * ActivityProgressChart.tsx (mesmo estado/fetch/grafico do card compacto
 * ActivityProgressCard.tsx, ver comentario la) com mais espaco: grafico
 * mais alto (220 vs 160 do card) e, abaixo dele, a lista de
 * atividades/sessoes do periodo selecionado (mesma janela de dias que o
 * grafico usa, ver PERIOD_DAYS) -- e o "detalhe real" que motivou esta
 * tarefa, nao so o agregado.
 *
 * /activity continua existindo e acessivel de outros lugares (botao "Veja
 * mais do seu progresso" do proprio card, historico em workout.tsx) —
 * nao foi removida nem redirecionada, so os 2 tiles da Comparacao Mensal
 * passaram a apontar pra ca.
 */
export default function ActivityProgressScreen() {
  const { tab, setTab, period, setPeriod, runProgress, workoutProgress, progress, errorMessage } = useActivityProgress();
  const tabColor = TAB_COLOR[tab];

  const [runs, setRuns] = useState<Run[] | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const cutoff = periodCutoff(PERIOD_DAYS[period]);
      if (tab === 'run') {
        const data = await listRuns();
        setRuns(data.filter((run) => parseUtcDate(run.started_at) >= cutoff).sort((a, b) => b.started_at.localeCompare(a.started_at)));
      } else {
        const data = await listWorkoutSessions(cutoff, new Date());
        setSessions([...data].sort((a, b) => b.completed_at.localeCompare(a.completed_at)));
      }
    } catch {
      // Lista e um complemento do grafico -- se falhar, so some a secao
      // (o grafico/estatisticas acima, vindos de useActivityProgress, tem
      // seu proprio tratamento de erro e continuam funcionando).
      if (tab === 'run') setRuns([]);
      else setSessions([]);
    } finally {
      setListLoading(false);
    }
  }, [tab, period]);

  useFocusEffect(
    useCallback(() => {
      fetchList();
    }, [fetchList])
  );

  const heroValue = tab === 'run' ? (runProgress ? formatDistance(runProgress.distance_km) : '--') : workoutProgress ? `${workoutProgress.sessions_count}` : '--';
  const heroUnit = tab === 'run' ? 'km' : workoutProgress?.sessions_count === 1 ? 'sessão' : 'sessões';
  const listItems = tab === 'run' ? runs : sessions;

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors3.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Progresso</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard style={styles.chartCard} padding={24}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sectionTitle}>Esta semana</Text>
              <View style={styles.heroRow}>
                <Text style={styles.heroValue}>{heroValue}</Text>
                <Text style={styles.heroUnit}>{heroUnit}</Text>
              </View>
            </View>
            <View style={styles.tabRow}>
              {TAB_OPTIONS.map((option) => {
                const selected = option.value === tab;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setTab(option.value)}
                    style={[styles.tabPill, selected && { backgroundColor: TAB_COLOR[option.value].bg }]}
                  >
                    <Text style={[styles.tabPillText, selected && { color: TAB_COLOR[option.value].text }]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.periodRow}>
            {PERIOD_OPTIONS.map((option) => {
              const selected = option.value === period;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPeriod(option.value)}
                  style={[styles.periodPill, selected && styles.periodPillSelected]}
                >
                  <Text style={[styles.periodPillText, selected && styles.periodPillTextSelected]}>
                    {option.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {errorMessage ? (
            <Text style={styles.emptyText}>{errorMessage}</Text>
          ) : !progress ? (
            <Text style={styles.emptyText}>Carregando...</Text>
          ) : (
            <>
              <ActivityProgressChart tab={tab} progress={progress} tabColor={tabColor} barTrackHeight={220} />
              <ActivityProgressStats tab={tab} runProgress={runProgress} workoutProgress={workoutProgress} />
            </>
          )}
        </GlassCard>

        <Text style={styles.listTitle}>{tab === 'run' ? 'Corridas' : 'Treinos'} no período</Text>

        {listLoading && !listItems ? (
          <ActivityIndicator color={colors3.primary} style={styles.listLoading} />
        ) : listItems && listItems.length > 0 ? (
          <View style={styles.list}>
            {tab === 'run'
              ? (listItems as Run[]).map((run) => <RunRow key={run.id} run={run} />)
              : (listItems as WorkoutSession[]).map((session) => <WorkoutSessionRow key={session.id} session={session} />)}
          </View>
        ) : (
          <Text style={styles.emptyListText}>
            {tab === 'run' ? 'Nenhuma corrida' : 'Nenhum treino'} registrado neste período.
          </Text>
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
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.md, paddingBottom: spacing3.xl * 2 },

  chartCard: { gap: spacing3.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sectionTitle: { ...typography3.labelSm, color: colors3.onSurfaceVariant },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing3.xs },
  heroValue: { ...typography3.displayLg, fontSize: 40, lineHeight: 44 },
  heroUnit: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginLeft: spacing3.xs },

  tabRow: { flexDirection: 'row', gap: spacing3.xs },
  tabPill: { paddingVertical: 6, paddingHorizontal: spacing3.sm + 4, borderRadius: radius3.pill },
  tabPillText: { ...typography3.labelSm, color: colors3.onSurfaceVariant },

  periodRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(229, 226, 225, 0.3)',
  },
  periodPill: { flex: 1, alignItems: 'center', paddingVertical: spacing3.sm, borderRadius: radius3.md },
  periodPillSelected: { backgroundColor: colors3.primary },
  periodPillText: { ...typography3.labelSm, color: colors3.onSurfaceVariant, textAlign: 'center' },
  periodPillTextSelected: { color: colors3.onPrimary },

  emptyText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },

  listTitle: { ...typography3.headlineMd, fontSize: 18 },
  listLoading: { marginTop: spacing3.lg },
  list: { gap: spacing3.sm },
  emptyListText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', paddingVertical: spacing3.lg },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1, gap: spacing3.xs },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...typography3.bodyMd, fontWeight: '600' },
  rowDate: { ...typography3.labelSm, textTransform: 'none' },
  rowStats: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
});
