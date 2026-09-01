import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Polyline } from 'react-native-maps';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import {
  ACTIVITY_TYPE_LABELS,
  ActivityInsight,
  ActivityType,
  ManualActivity,
  RoutePoint,
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
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Regiao que enquadra a rota inteira (nao so o ponto inicial, como a tela
 * de rastreamento ao vivo faz) — com uma margem de 30% pra rota nao ficar
 * colada na borda do mapa.
 */
function regionForRoute(points: RoutePoint[]) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const PADDING = 1.3;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING, 0.005),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING, 0.005),
  };
}

/**
 * Migracao liquiglass desta tela (item 2 da task "atividade-entrada-
 * unica") — estava no sistema antigo (colors/typography/Card/Button)
 * inteira, migrada de uma vez ja que a mudanca principal (mapa da rota)
 * ja mexe na tela inteira. Nenhuma logica de dados foi alterada, so a
 * adicao do mapa usando Run.route_points, que ja estava salvo no banco
 * mas nunca era exibido.
 */
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
  const hasRoute = !!run?.route_points && run.route_points.length > 1;

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{label || 'Atividade'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors2.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!!dateIso && <Text style={styles.date}>{formatActivityDate(dateIso)}</Text>}

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors2.violet} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && hasRoute && run && (
          <View style={styles.mapWrap}>
            <MapView style={styles.map} initialRegion={regionForRoute(run.route_points)} scrollEnabled zoomEnabled>
              <Polyline
                coordinates={run.route_points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor={colors2.violet}
                strokeWidth={4}
              />
            </MapView>
          </View>
        )}

        {!loading && run && (
          <LiquiglassCard style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{formatDistanceKm(run.distance_meters)}</Text>
                <Text style={styles.statLabel}>km</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{formatDuration(run.duration_seconds)}</Text>
                <Text style={styles.statLabel}>tempo</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{formatPace(run.avg_pace_seconds_per_km)}</Text>
                <Text style={styles.statLabel}>pace</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{Math.round(run.elevation_gain_meters)}</Text>
                <Text style={styles.statLabel}>elev. (m)</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              {run.calories_burned != null && (
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{Math.round(run.calories_burned)}</Text>
                  <Text style={styles.statLabel}>kcal</Text>
                </View>
              )}
              {run.heart_rate_avg != null && (
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{Math.round(run.heart_rate_avg)}</Text>
                  <Text style={styles.statLabel}>fc media</Text>
                </View>
              )}
              {run.heart_rate_max != null && (
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{run.heart_rate_max}</Text>
                  <Text style={styles.statLabel}>fc max</Text>
                </View>
              )}
            </View>
          </LiquiglassCard>
        )}

        {!loading && run && run.splits.length > 0 && (
          <LiquiglassCard style={styles.splitsCard}>
            <Text style={styles.splitsTitle}>Splits por km</Text>
            {run.splits.map((split, index) => (
              <View
                key={split.km}
                style={[styles.splitRow, index === run.splits.length - 1 && styles.splitRowLast]}
              >

                <Text style={styles.splitLabel}>
                  Km {split.km}
                  {split.is_partial ? ` (parcial, ${formatDistanceKm(split.distance_meters)} km)` : ''}
                </Text>
                <Text style={styles.splitPace}>{formatPace(split.avg_pace_seconds_per_km)}</Text>
              </View>
            ))}
          </LiquiglassCard>
        )}

        {!loading && manual && (
          <LiquiglassCard style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{manual.duration_minutes}</Text>
                <Text style={styles.statLabel}>minutos</Text>
              </View>
              {manual.calories_burned != null && (
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{Math.round(manual.calories_burned)}</Text>
                  <Text style={styles.statLabel}>kcal</Text>
                </View>
              )}
            </View>
            {!!manual.notes && <Text style={styles.notes}>{manual.notes}</Text>}
          </LiquiglassCard>
        )}

        {!loading && (run || manual) && (
          <>
            {insight ? (
              <LiquiglassCard style={styles.insightCard}>
                <Text style={styles.insightSummary}>{insight.summary}</Text>
                {!!insight.highlight && (
                  <View style={styles.insightHighlightRow}>
                    <Ionicons name="sparkles" size={16} color={colors2.violet} />
                    <Text style={styles.insightHighlight}>{insight.highlight}</Text>
                  </View>
                )}
                <Text style={styles.insightSuggestion}>{insight.suggestion}</Text>
              </LiquiglassCard>
            ) : (
              <>
                {!!insightError && <Text style={styles.error}>{insightError}</Text>}
                <Button2
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
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  title: { ...typography2.headlineMd },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  date: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: -spacing2.sm },
  centered: { alignItems: 'center', marginTop: spacing2.xl },
  error: { color: colors2.danger, textAlign: 'center' },

  mapWrap: { height: 220, borderRadius: radius2.lg, overflow: 'hidden' },
  map: { flex: 1 },

  statsCard: { gap: spacing2.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  statNumber: { ...typography2.metricMono, fontSize: 22 },
  statLabel: { ...typography2.labelCaps, textTransform: 'none', marginTop: 2, color: colors2.onSurfaceVariant },
  notes: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  splitsCard: { gap: spacing2.sm },
  splitsTitle: { ...typography2.headlineMd, fontSize: 18, marginBottom: spacing2.xs },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing2.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors2.outlineVariant,
  },
  splitRowLast: { borderBottomWidth: 0 },
  splitLabel: { ...typography2.bodyMd, fontSize: 14 },
  splitPace: { ...typography2.metricMono, fontSize: 14, color: colors2.onSurfaceVariant },

  insightCard: { gap: spacing2.sm },
  insightSummary: { ...typography2.bodyMd },
  insightHighlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  insightHighlight: { ...typography2.bodyMd, fontSize: 14, fontWeight: '600', flex: 1 },
  insightSuggestion: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
});
