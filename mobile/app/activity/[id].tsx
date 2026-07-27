import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import {
  ACTIVITY_TYPE_LABELS,
  ActivityInsight,
  ActivityType,
  ManualActivity,
  RunDetail,
  formatActivityDate,
  formatDistanceKm,
  formatDuration,
  formatPace,
  getManualActivity,
  getManualActivityInsight,
  getRun,
  getRunInsight,
} from '@/services/activities';
import { colors, spacing, typography } from '@/constants/theme';

export default function ActivityDetailScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const isRun = kind === 'run';

  const [run, setRun] = useState<RunDetail | null>(null);
  const [manual, setManual] = useState<ManualActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [insight, setInsight] = useState<ActivityInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (isRun) {
          setRun(await getRun(id));
        } else {
          setManual(await getManualActivity(id));
        }
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar esta atividade.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isRun]);

  const handleFetchInsight = async () => {
    if (!id) return;
    setInsightLoading(true);
    setInsightError(null);
    try {
      setInsight(isRun ? await getRunInsight(id) : await getManualActivityInsight(id));
    } catch (err) {
      setInsightError(getApiErrorMessage(err, 'Nao foi possivel gerar a analise desta atividade.'));
    } finally {
      setInsightLoading(false);
    }
  };

  const activityType = (run?.activity_type ?? manual?.activity_type) as ActivityType | undefined;
  const label = activityType ? ACTIVITY_TYPE_LABELS[activityType] ?? activityType : '';
  const dateIso = run?.started_at ?? manual?.performed_at;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{label || 'Atividade'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!!dateIso && <Text style={styles.date}>{formatActivityDate(dateIso)}</Text>}

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && run && (
          <Card style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={typography.statNumber}>{formatDistanceKm(run.distance_meters)}</Text>
                <Text style={typography.statLabel}>km</Text>
              </View>
              <View style={styles.stat}>
                <Text style={typography.statNumber}>{formatDuration(run.duration_seconds)}</Text>
                <Text style={typography.statLabel}>tempo</Text>
              </View>
              <View style={styles.stat}>
                <Text style={typography.statNumber}>{formatPace(run.avg_pace_seconds_per_km)}</Text>
                <Text style={typography.statLabel}>pace</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              {run.calories_burned != null && (
                <View style={styles.stat}>
                  <Text style={typography.statNumber}>{Math.round(run.calories_burned)}</Text>
                  <Text style={typography.statLabel}>kcal</Text>
                </View>
              )}
              {run.heart_rate_avg != null && (
                <View style={styles.stat}>
                  <Text style={typography.statNumber}>{Math.round(run.heart_rate_avg)}</Text>
                  <Text style={typography.statLabel}>fc media</Text>
                </View>
              )}
              {run.heart_rate_max != null && (
                <View style={styles.stat}>
                  <Text style={typography.statNumber}>{run.heart_rate_max}</Text>
                  <Text style={typography.statLabel}>fc max</Text>
                </View>
              )}
            </View>
          </Card>
        )}

        {!loading && manual && (
          <Card style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={typography.statNumber}>{manual.duration_minutes}</Text>
                <Text style={typography.statLabel}>minutos</Text>
              </View>
              {manual.calories_burned != null && (
                <View style={styles.stat}>
                  <Text style={typography.statNumber}>{Math.round(manual.calories_burned)}</Text>
                  <Text style={typography.statLabel}>kcal</Text>
                </View>
              )}
            </View>
            {!!manual.notes && <Text style={styles.notes}>{manual.notes}</Text>}
          </Card>
        )}

        {!loading && (run || manual) && (
          <>
            {insight ? (
              <Card style={styles.insightCard}>
                <Text style={styles.insightSummary}>{insight.summary}</Text>
                {!!insight.highlight && (
                  <View style={styles.insightHighlightRow}>
                    <Ionicons name="sparkles" size={16} color={colors.accent} />
                    <Text style={styles.insightHighlight}>{insight.highlight}</Text>
                  </View>
                )}
                <Text style={styles.insightSuggestion}>{insight.suggestion}</Text>
              </Card>
            ) : (
              <>
                {!!insightError && <Text style={styles.error}>{insightError}</Text>}
                <Button
                  label="Ver analise da IA"
                  variant="secondary"
                  onPress={handleFetchInsight}
                  loading={insightLoading}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  date: { ...typography.bodySecondary, marginTop: -spacing.sm },
  centered: { alignItems: 'center', marginTop: spacing.xl },
  error: { color: colors.danger, textAlign: 'center' },

  statsCard: { gap: spacing.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  notes: { ...typography.bodySecondary },

  insightCard: { gap: spacing.sm },
  insightSummary: { ...typography.body },
  insightHighlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  insightHighlight: { ...typography.bodySecondary, fontWeight: '600', flex: 1 },
  insightSuggestion: { ...typography.bodySecondary },
});
