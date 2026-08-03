import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';

import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import { formatDistanceKm, formatDuration, formatPace } from '@/services/activities';
import { LiveActivity, getLiveActivity } from '@/services/liveActivities';
import { colors, radius, spacing, typography } from '@/constants/theme';

// Frequencia do polling — o professor nao precisa de mais que isso pra
// acompanhar um treino em andamento (ver decisao de polling vs WebSocket).
const POLL_INTERVAL_MS = 7000;

export default function TrainerLiveActivityScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [activity, setActivity] = useState<LiveActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const poll = async () => {
      try {
        const data = await getLiveActivity(id);
        if (active) {
          setActivity(data);
          setError(null);
        }
      } catch (err) {
        if (!active) return;
        // 404 aqui significa "o aluno finalizou" ou "perdi acesso" — nao e
        // um erro de rede pra insistir, e um sinal claro de que acabou.
        setEnded(true);
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar esta atividade.'));
      } finally {
        if (active) setLoading(false);
      }
    };

    poll();
    const interval = setInterval(() => {
      if (!ended) poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ended]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{name || 'Ao vivo'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {!loading && ended && (
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors.textMuted} />
          <Text style={styles.endedText}>{error ?? 'Este treino ja foi encerrado.'}</Text>
        </View>
      )}

      {!loading && !ended && activity && (
        <View style={styles.content}>
          {activity.last_lat != null && activity.last_lng != null && (
            <MapView
              style={styles.map}
              region={{
                latitude: activity.last_lat,
                longitude: activity.last_lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={{ latitude: activity.last_lat, longitude: activity.last_lng }} />
            </MapView>
          )}

          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Ao vivo</Text>
          </View>

          <Card style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={typography.statNumber}>{formatDistanceKm(activity.distance_meters)}</Text>
                <Text style={typography.statLabel}>km</Text>
              </View>
              <View style={styles.stat}>
                <Text style={typography.statNumber}>{formatDuration(activity.elapsed_seconds)}</Text>
                <Text style={typography.statLabel}>tempo</Text>
              </View>
              <View style={styles.stat}>
                <Text style={typography.statNumber}>{formatPace(activity.pace_seconds_per_km)}</Text>
                <Text style={typography.statLabel}>pace</Text>
              </View>
            </View>
            <View style={styles.heartRateRow}>
              <Ionicons name="heart" size={16} color={colors.danger} />
              <Text style={styles.heartRateText}>
                {activity.heart_rate_bpm != null ? `${activity.heart_rate_bpm} bpm` : '-- bpm'}
              </Text>
            </View>
          </Card>
        </View>
      )}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  endedText: { ...typography.bodySecondary, textAlign: 'center' },

  content: { flex: 1, padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  map: { width: '100%', height: 220, borderRadius: radius.lg },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  liveText: { ...typography.caption, color: colors.success, fontWeight: '700' },

  statsCard: { gap: spacing.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center' },
  heartRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  heartRateText: { ...typography.body, fontWeight: '600' },
});
