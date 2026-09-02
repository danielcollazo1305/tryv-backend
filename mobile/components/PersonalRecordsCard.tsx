import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  ActivityTypeRecords,
  PersonalRecords,
  formatDistanceKm,
  formatDuration,
  formatPace,
  getPersonalRecords,
} from '@/services/activities';
import { colors3, spacing3, typography3 } from '@/constants/theme';

const PACE_REFERENCE_ORDER = ['1km', '5km', '10km'];

function activityLabel(activityType: string): string {
  return ACTIVITY_TYPE_LABELS[activityType as ActivityType] ?? activityType;
}

function activityIcon(activityType: string) {
  return ACTIVITY_TYPE_ICONS[activityType as ActivityType] ?? 'trophy';
}

function ActivityTypeBlock({ activityType, records }: { activityType: string; records: ActivityTypeRecords }) {
  const paceEntries = PACE_REFERENCE_ORDER.filter((label) => records.best_pace_by_reference[label]);

  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <Ionicons name={activityIcon(activityType)} size={16} color={colors3.primary} />
        <Text style={styles.blockTitle}>{activityLabel(activityType)}</Text>
      </View>

      {records.longest_distance && (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Maior distancia</Text>
          <Text style={styles.rowValue}>{formatDistanceKm(records.longest_distance.distance_meters)} km</Text>
        </View>
      )}

      {records.longest_duration && (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Mais longa</Text>
          <Text style={styles.rowValue}>{formatDuration(records.longest_duration.duration_seconds)}</Text>
        </View>
      )}

      {paceEntries.map((label) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>Melhor pace ({label})</Text>
          <Text style={styles.rowValue}>{formatPace(records.best_pace_by_reference[label].avg_pace_seconds_per_km)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Recordes pessoais por modalidade (corrida/pedalada/etc.) — card
 * auto-suficiente, mesmo padrao do ReadinessCard/MonthComparisonCard: some
 * silenciosamente se falhar, nao ha nada registrado ainda, ou o usuario nao
 * for Pro (402).
 *
 * Migrado pro tema claro "prism-glass" nesta tarefa (LiquiglassCard ->
 * GlassCard, colors2 -> colors3) — exclusivo da Home (confirmado, nenhum
 * outro import real do componente), migracao direta sem prop variant. Card
 * unico full-width (so `gap` no proprio style, sem flexBasis percentual),
 * entao nao tem a mesma pegadinha de largura do MonthComparisonCard. So
 * recoloracao, nenhuma logica de recordes pessoais alterada.
 */
export function PersonalRecordsCard() {
  const [records, setRecords] = useState<PersonalRecords | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await getPersonalRecords());
    } catch {
      setRecords(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRecords();
    }, [fetchRecords])
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors3.primary} />
      </View>
    );
  }

  const activityTypes = records ? Object.keys(records.records_by_activity_type) : [];
  if (activityTypes.length === 0) return null;

  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>Recordes pessoais</Text>
      {activityTypes.map((activityType) => (
        <ActivityTypeBlock
          key={activityType}
          activityType={activityType}
          records={records!.records_by_activity_type[activityType]}
        />
      ))}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing3.xs },
  card: { gap: spacing3.sm },
  title: { ...typography3.headlineMd, fontSize: 18, marginBottom: spacing3.xs },

  block: { gap: 6, paddingVertical: spacing3.sm, borderTopWidth: 1, borderTopColor: colors3.outlineVariant },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs, marginBottom: 2 },
  blockTitle: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700', color: colors3.onSurface },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...typography3.labelSm, textTransform: 'none' },
  rowValue: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700' },
});
