import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
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
  listManualActivities,
  listRuns,
  parseUtcDate,
} from '@/services/activities';
import { colors, radius, spacing, typography } from '@/constants/theme';

type FeedEntry = { kind: 'run'; data: Run } | { kind: 'manual'; data: ManualActivity };

function entryDate(entry: FeedEntry): Date {
  return parseUtcDate(entry.kind === 'run' ? entry.data.started_at : entry.data.performed_at);
}

function ActivityRow({ entry }: { entry: FeedEntry }) {
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
      <Card style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={colors.accent} />
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowDate}>{formatActivityDate(entryDate(entry).toISOString())}</Text>
          </View>
          <Text style={styles.rowStats}>{statsLine}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

export default function ActivitiesScreen() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [manualActivities, setManualActivities] = useState<ManualActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const feed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [
      ...runs.map((data): FeedEntry => ({ kind: 'run', data })),
      ...manualActivities.map((data): FeedEntry => ({ kind: 'manual', data })),
    ];
    return entries.sort((a, b) => entryDate(b).getTime() - entryDate(a).getTime());
  }, [runs, manualActivities]);

  return (
    <View style={styles.flex}>
      <FlatList
        data={feed}
        keyExtractor={(item) => `${item.kind}-${item.data.id}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Minhas atividades</Text>
              <Pressable style={styles.healthButton} onPress={() => router.push('/activity/healthkit')} hitSlop={8}>
                <Ionicons name="heart" size={16} color={colors.accent} />
                <Text style={styles.healthButtonText}>Apple Health</Text>
              </Pressable>
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => <ActivityRow entry={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="footsteps-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma atividade registrada ainda.</Text>
            </View>
          ) : null
        }
      />

      <Pressable style={styles.fab} onPress={() => router.push('/activity/new')}>
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl * 2 },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography.h1 },
  healthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  healthButtonText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  error: { color: colors.danger, textAlign: 'center' },
  loading: { marginTop: spacing.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1, gap: spacing.xs },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...typography.body, fontWeight: '600' },
  rowDate: { ...typography.caption },
  rowStats: { ...typography.bodySecondary },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
