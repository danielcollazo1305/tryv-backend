import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ObscuredCard } from '@/components/ObscuredCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  formatDistanceKm,
  formatDuration,
  formatPace,
} from '@/services/activities';
import { LiveActivity, getLiveActivity } from '@/services/liveActivities';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

// Frequencia do polling — o professor nao precisa de mais que isso pra
// acompanhar um treino em andamento (ver decisao de polling vs WebSocket).
const POLL_INTERVAL_MS = 7000;

function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.liveDotWrap}>
      <Animated.View
        style={[
          styles.liveDotRing,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
          },
        ]}
      />
      <View style={styles.liveDot} />
    </View>
  );
}

/**
 * Backdrop decorativo (aneis concentricos + icone da atividade pulsando no
 * centro), no lugar do mapa real anterior.
 *
 * Lacuna de dado: o mockup marketplace-live-activity.html desenha uma rota
 * (SVG path curvo) representando o trajeto percorrido. O backend hoje so
 * envia a ULTIMA posicao conhecida (LiveActivity.last_lat/last_lng, um
 * unico ponto) — nao existe um historico de pontos/polyline pra desenhar
 * uma rota real. Desenhar uma curva "bonita" aqui seria inventar geometria
 * que nao corresponde ao trajeto de verdade, entao o backdrop fica
 * puramente decorativo (aneis + pulso), sem tentar representar a rota.
 * O pulso central so aparece quando ha sinal de GPS real (last_lat/lng
 * presentes), o que preserva o unico dado real disponivel: "ha sinal
 * agora ou nao".
 */
function LiveRadarBackdrop({ hasSignal, icon }: { hasSignal: boolean; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasSignal) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasSignal, pulse]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.radarBg} />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 400">
        <Circle cx={200} cy={200} r={70} stroke={colors2.primary} strokeWidth={1} opacity={0.15} fill="none" />
        <Circle cx={200} cy={200} r={130} stroke={colors2.primary} strokeWidth={1} opacity={0.1} fill="none" />
        <Circle cx={200} cy={200} r={190} stroke={colors2.primary} strokeWidth={1} opacity={0.06} fill="none" />
      </Svg>
      <View style={styles.radarCenter} pointerEvents="none">
        {hasSignal && (
          <Animated.View
            style={[
              styles.radarPulse,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
              },
            ]}
          />
        )}
        <View style={styles.radarIconWrap}>
          <Ionicons name={icon} size={22} color={colors2.primary} />
        </View>
      </View>
      <LinearGradient
        colors={['transparent', 'rgba(19,19,19,0.6)', colors2.background]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

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

  const activityType = (activity?.activity_type as ActivityType) ?? 'run';
  const activityLabel = ACTIVITY_TYPE_LABELS[activityType] ?? activity?.activity_type ?? 'Atividade';
  const activityIcon = ACTIVITY_TYPE_ICONS[activityType] ?? 'walk';
  const hasSignal = activity?.last_lat != null && activity?.last_lng != null;

  return (
    <ScreenBackground2 style={styles.flex}>
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors2.violet} />
        </View>
      )}

      {!loading && ended && (
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors2.onSurfaceVariant} />
          <Text style={styles.endedText}>{error ?? 'Este treino ja foi encerrado.'}</Text>
        </View>
      )}

      {!loading && !ended && activity && (
        <>
          <LiveRadarBackdrop hasSignal={hasSignal} icon={activityIcon} />

          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
              <Ionicons name="close" size={22} color={colors2.onSurface} />
            </Pressable>
            <View style={styles.headerCenter}>
              <View style={styles.liveRow}>
                <LiveDot />
                <Text style={styles.liveLabel}>AO VIVO</Text>
              </View>
              <Text style={styles.name}>{name || 'Aluno'}</Text>
            </View>
            <View style={{ width: 22 }} />
          </View>

          <View style={styles.metricsArea}>
            <LiquiglassCard style={styles.distanceCard}>
              <View style={styles.distanceHeader}>
                <View style={styles.distanceLabelRow}>
                  <Ionicons name="navigate" size={14} color={colors2.primary} />
                  <Text style={styles.distanceLabel}>DISTANCIA</Text>
                </View>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{activityLabel}</Text>
                </View>
              </View>
              <View style={styles.distanceValueRow}>
                <Text style={styles.distanceValue}>{formatDistanceKm(activity.distance_meters)}</Text>
                <Text style={styles.distanceUnit}>km</Text>
              </View>
            </LiquiglassCard>

            <View style={styles.statsRow}>
              <LiquiglassCard style={styles.statCard} padding={spacing2.md}>
                <Text style={styles.statLabel}>PACE</Text>
                <Text style={styles.statValue}>{formatPace(activity.pace_seconds_per_km)}</Text>
              </LiquiglassCard>
              <LiquiglassCard style={styles.statCard} padding={spacing2.md}>
                <Text style={styles.statLabel}>TEMPO</Text>
                <Text style={styles.statValue}>{formatDuration(activity.elapsed_seconds)}</Text>
              </LiquiglassCard>
              <LiquiglassCard style={styles.statCard} padding={spacing2.md}>
                <View style={styles.hrLabelRow}>
                  <Ionicons name="heart" size={12} color={colors2.danger} />
                  <Text style={styles.statLabel}>FC</Text>
                </View>
                <Text style={styles.statValue}>
                  {activity.heart_rate_bpm != null ? activity.heart_rate_bpm : '--'}
                  <Text style={styles.statUnit}> bpm</Text>
                </Text>
              </LiquiglassCard>
            </View>

            {/*
              Nota de escopo: o mockup mostra uma barra de progresso com
              "Meta: 20km" e um botao "Enviar Audio". Nenhum dos dois tem
              dado/endpoint real hoje (nao ha meta de distancia definida
              pra uma Live Activity, nem envio de audio) — em vez de
              inventar uma meta fixa ou um botao sem acao real, o bloco
              usa o padrao ObscuredCard (blur + cadeado), preservando a
              estrutura/dimensao do mockup sem fingir que ha dado real.
            */}
            <ObscuredCard style={styles.goalCard}>
              <View style={styles.goalRow}>
                <Text style={styles.goalLabel}>Meta: 20km</Text>
                <Text style={styles.goalPercent}>0%</Text>
              </View>
              <View style={styles.goalBarTrack}>
                <View style={styles.goalBarFill} />
              </View>
              <View style={styles.audioButton}>
                <Ionicons name="mic" size={16} color={colors2.onSurface} />
                <Text style={styles.audioButtonText}>Enviar Audio</Text>
              </View>
            </ObscuredCard>
          </View>
        </>
      )}
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing2.sm, padding: spacing2.lg },
  endedText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

  radarBg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a0a0a' },
  radarCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  radarPulse: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: radius2.pill,
    backgroundColor: colors2.primary,
  },
  radarIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(32, 31, 31, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { alignItems: 'center', gap: 2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveDotRing: { position: 'absolute', width: 8, height: 8, borderRadius: radius2.pill, backgroundColor: colors2.success },
  liveDot: { width: 7, height: 7, borderRadius: radius2.pill, backgroundColor: colors2.success },
  liveLabel: { ...typography2.labelCaps, fontSize: 10 },
  name: { ...typography2.headlineMd, fontSize: 18 },

  metricsArea: { flex: 1, justifyContent: 'flex-end', padding: spacing2.containerMargin, gap: spacing2.md },

  distanceCard: { gap: spacing2.sm },
  distanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  distanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  distanceLabel: { ...typography2.labelCaps, fontSize: 11 },
  typeBadge: {
    paddingHorizontal: spacing2.sm,
    paddingVertical: 2,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
  },
  typeBadgeText: { ...typography2.labelCaps, fontSize: 10, textTransform: 'none' },
  distanceValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing2.sm },
  distanceValue: { ...typography2.displayHero, fontSize: 48 },
  distanceUnit: { ...typography2.metricMono, fontSize: 16, color: colors2.primary },

  statsRow: { flexDirection: 'row', gap: spacing2.sm },
  statCard: { flex: 1, gap: spacing2.xs },
  hrLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { ...typography2.labelCaps, fontSize: 9 },
  statValue: { ...typography2.metricMono, fontSize: 20 },
  statUnit: { ...typography2.bodyMd, fontSize: 11, color: colors2.onSurfaceVariant },

  goalCard: {
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    padding: spacing2.md,
    gap: spacing2.sm,
  },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalLabel: { ...typography2.bodyMd, fontSize: 13, fontWeight: '600' },
  goalPercent: { ...typography2.metricMono, fontSize: 13, color: colors2.primary },
  goalBarTrack: {
    height: 6,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    overflow: 'hidden',
  },
  goalBarFill: { width: '35%', height: '100%', borderRadius: radius2.pill, backgroundColor: colors2.violet },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.xs,
    paddingVertical: spacing2.sm,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  audioButtonText: { ...typography2.bodyMd, fontSize: 13, fontWeight: '600' },
});
