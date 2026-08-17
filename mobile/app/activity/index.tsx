import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { HealthSummaryCard } from '@/components/HealthSummaryCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  ManualActivity,
  Run,
  formatActivityDate,
  formatDistanceKm,
  formatDuration,
  getPersonalRecords,
  listManualActivities,
  listRuns,
  parseUtcDate,
} from '@/services/activities';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

type FeedEntry = { kind: 'run'; data: Run } | { kind: 'manual'; data: ManualActivity };

function entryDate(entry: FeedEntry): Date {
  return parseUtcDate(entry.kind === 'run' ? entry.data.started_at : entry.data.performed_at);
}

/**
 * PR = a corrida aparece em algum slot de recorde (maior distancia, mais
 * longa, ou melhor pace de referencia) do endpoint /runs/personal-records —
 * ja usado no PersonalRecordsCard da Home. Nao existe indicador assim pra
 * ManualActivity (o endpoint de recordes so cobre corridas com GPS).
 */
function ActivityRow({ entry, isPersonalRecord }: { entry: FeedEntry; isPersonalRecord: boolean }) {
  const activityType = entry.data.activity_type as ActivityType;
  const label = ACTIVITY_TYPE_LABELS[activityType] ?? entry.data.activity_type;
  const icon = ACTIVITY_TYPE_ICONS[activityType] ?? 'body';

  const statsLine =
    entry.kind === 'run'
      ? `${formatDistanceKm(entry.data.distance_meters)} km  •  ${formatDuration(entry.data.duration_seconds)}`
      : `${entry.data.duration_minutes} min${
          entry.data.calories_burned != null ? `  •  ${Math.round(entry.data.calories_burned)} kcal` : ''
        }`;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: entry.data.id, kind: entry.kind } })}
    >
      <LiquiglassCard style={styles.row}>
        {isPersonalRecord && (
          <View style={styles.prBadge}>
            <Ionicons name="trophy" size={12} color={colors2.white} />
            <Text style={styles.prBadgeText}>Recorde</Text>
          </View>
        )}
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={colors2.primary} />
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowDate}>{formatActivityDate(entryDate(entry).toISOString())}</Text>
          </View>
          <Text style={styles.rowStats}>{statsLine}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
      </LiquiglassCard>
    </Pressable>
  );
}

export default function ActivitiesScreen() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [manualActivities, setManualActivities] = useState<ManualActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ids de corrida que aparecem em algum slot de recorde pessoal — busca
  // silenciosa e independente do feed principal (mesmo padrao do
  // PersonalRecordsCard: falha nunca bloqueia o resto da tela, so significa
  // "sem selo de recorde por enquanto").
  const [personalRecordRunIds, setPersonalRecordRunIds] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsData, manualData] = await Promise.all([listRuns(), listManualActivities()]);
      setRuns(runsData);
      setManualActivities(manualData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar suas atividades.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPersonalRecordIds = useCallback(async () => {
    try {
      const records = await getPersonalRecords();
      const ids = new Set<string>();
      Object.values(records.records_by_activity_type).forEach((typeRecords) => {
        if (typeRecords.longest_distance) ids.add(typeRecords.longest_distance.run_id);
        if (typeRecords.longest_duration) ids.add(typeRecords.longest_duration.run_id);
        Object.values(typeRecords.best_pace_by_reference).forEach((pace) => ids.add(pace.run_id));
      });
      setPersonalRecordRunIds(ids);
    } catch {
      setPersonalRecordRunIds(new Set());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  useFocusEffect(
    useCallback(() => {
      fetchPersonalRecordIds();
    }, [fetchPersonalRecordIds])
  );

  const feed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [
      ...runs.map((data): FeedEntry => ({ kind: 'run', data })),
      ...manualActivities.map((data): FeedEntry => ({ kind: 'manual', data })),
    ];
    return entries.sort((a, b) => entryDate(b).getTime() - entryDate(a).getTime());
  }, [runs, manualActivities]);

  return (
    <ScreenBackground2 style={styles.flex}>
      <FlatList
        data={feed}
        keyExtractor={(item) => `${item.kind}-${item.data.id}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Minhas atividades</Text>
              <Pressable style={styles.healthButton} onPress={() => router.push('/activity/healthkit')} hitSlop={8}>
                <Ionicons name="download-outline" size={16} color={colors2.primary} />
                <Text style={styles.healthButtonText}>Importar treinos</Text>
              </Pressable>
            </View>
            <HealthSummaryCard />
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => (
          <ActivityRow entry={item} isPersonalRecord={item.kind === 'run' && personalRecordRunIds.has(item.data.id)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing2.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="footsteps-outline" size={32} color={colors2.onSurfaceVariant} />
              <Text style={styles.emptyText}>Nenhuma atividade registrada ainda.</Text>
            </View>
          ) : null
        }
      />

      <Pressable style={styles.fab} onPress={() => router.push('/activity/new')}>
        <Ionicons name="add" size={28} color={colors2.white} />
      </Pressable>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.xl * 2 },
  header: { gap: spacing2.sm, marginBottom: spacing2.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography2.headlineLgMobile, fontSize: 26 },
  healthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.xs,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  healthButtonText: { ...typography2.labelCaps, textTransform: 'none', color: colors2.primary, fontWeight: '700' },
  error: { color: colors2.danger, textAlign: 'center' },
  loading: { marginTop: spacing2.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md, position: 'relative', overflow: 'visible' },
  prBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors2.violet,
    borderRadius: radius2.pill,
    paddingHorizontal: spacing2.sm,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 1,
  },
  prBadgeText: { ...typography2.labelCaps, textTransform: 'uppercase', color: colors2.white, fontSize: 10 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius2.md,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1, gap: spacing2.xs },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...typography2.bodyMd, fontWeight: '600' },
  rowDate: { ...typography2.labelCaps, textTransform: 'none' },
  rowStats: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },

  fab: {
    position: 'absolute',
    right: spacing2.lg,
    bottom: spacing2.lg,
    width: 56,
    height: 56,
    borderRadius: radius2.pill,
    backgroundColor: colors2.violet,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});
