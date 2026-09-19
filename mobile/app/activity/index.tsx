import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { HealthSummaryCard } from '@/components/HealthSummaryCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
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
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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
      style={styles.rowWrapper}
      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: entry.data.id, kind: entry.kind } })}
    >
      {/*
        Badge fora do LiquiglassCard de proposito (nao dentro dele como
        antes) -- o `wrapper` interno do LiquiglassCard tem overflow:'hidden'
        (necessario pra recortar o blur/gradiente nos cantos arredondados),
        que cortava esse badge sempre que ele tentava "escapar" da borda do
        card (top:-8/right:-8). Como irmao do card, dentro deste
        Pressable com position:'relative', o badge sobrepoe o canto sem ser
        recortado. Bug pre-existente, nao introduzido por esta migracao —
        mesma limitacao vale pros outros consumidores de LiquiglassCard que
        colocam algo posicionado fora dos limites do card.
      */}
      {isPersonalRecord && (
        <View style={styles.prBadge}>
          <Ionicons name="trophy" size={12} color={colors3.white} />
          <Text style={styles.prBadgeText}>Recorde</Text>
        </View>
      )}
      <LiquiglassCard variant="light">
        {/*
          rowContent embrulha os filhos reais num unico View com seu proprio
          flexDirection:'row' -- o `style` passado direto pro LiquiglassCard
          so alcanca o shadowWrapper mais externo (que tem 1 filho so, entao
          flexDirection ali nao tem efeito nenhum sobre os netos), nunca o
          `content` interno onde os filhos de fato moram. Mesmo bug
          pre-existente do badge acima; workaround local, sem mexer no
          componente compartilhado (usado por ~39 arquivos).
        */}
        <View style={styles.rowContent}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={22} color={colors3.primary} />
          </View>
          <View style={styles.rowInfo}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowDate}>{formatActivityDate(entryDate(entry).toISOString())}</Text>
            </View>
            <Text style={styles.rowStats}>{statsLine}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
        </View>
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
    <ScreenBackground3 style={styles.flex}>
      <FlatList
        data={feed}
        keyExtractor={(item) => `${item.kind}-${item.data.id}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Minhas atividades</Text>
              <Pressable style={styles.healthButton} onPress={() => router.push('/activity/healthkit')} hitSlop={8}>
                <Ionicons name="download-outline" size={16} color={colors3.primary} />
                <Text style={styles.healthButtonText}>Importar treinos</Text>
              </Pressable>
            </View>
            <HealthSummaryCard variant="light" />
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors3.primary} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => (
          <ActivityRow entry={item} isPersonalRecord={item.kind === 'run' && personalRecordRunIds.has(item.data.id)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="footsteps-outline" size={32} color={colors3.onSurfaceVariant} />
              <Text style={styles.emptyText}>Nenhuma atividade registrada ainda.</Text>
            </View>
          ) : null
        }
      />

      <Pressable style={styles.fab} onPress={() => router.push('/activity/new')}>
        <Ionicons name="add" size={28} color={colors3.white} />
      </Pressable>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing3.containerMargin, paddingTop: spacing3.xl, paddingBottom: spacing3.xl * 2 },
  header: { gap: spacing3.sm, marginBottom: spacing3.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },
  healthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.xs,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  healthButtonText: { ...typography3.labelSm, textTransform: 'none', color: colors3.primary, fontWeight: '700' },
  error: { color: colors3.error, textAlign: 'center' },
  loading: { marginTop: spacing3.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.sm },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

  rowWrapper: { position: 'relative' },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  prBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors3.primary,
    borderRadius: radius3.pill,
    paddingHorizontal: spacing3.sm,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 1,
  },
  prBadgeText: { ...typography3.labelSm, textTransform: 'uppercase', color: colors3.white, fontSize: 10 },
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

  fab: {
    position: 'absolute',
    right: spacing3.lg,
    bottom: spacing3.lg,
    width: 56,
    height: 56,
    borderRadius: radius3.pill,
    backgroundColor: colors3.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors3.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});
