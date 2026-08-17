import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Polyline } from 'react-native-maps';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import {
  ActivityInsight,
  ActivityType,
  GpsActivityType,
  ManualActivity,
  ManualActivityType,
  RoutePoint,
  Run,
  createManualActivity,
  createRun,
  formatDistanceKm,
  formatDuration,
  formatPace,
  getManualActivityInsight,
  getRunInsight,
} from '@/services/activities';
import { fetchRecentHeartRateBpm } from '@/services/healthkit';
import { finishLiveActivity, startLiveActivity, updateLiveActivity } from '@/services/liveActivities';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

// Intervalo minimo entre atualizacoes ao vivo enviadas pro backend — o GPS
// pinga a cada ~4s, mas o professor acompanhando nao precisa de mais que
// isso; throttle evita chamadas de rede desnecessarias.
const LIVE_UPDATE_THROTTLE_MS = 5000;
// Uma leitura de FC mais velha que isso nao e mostrada como "ao vivo" —
// melhor omitir do que enganar o professor com um numero de minutos atras.
const LIVE_HEART_RATE_MAX_AGE_MS = 2 * 60 * 1000;

type Stage = 'select' | 'tracking' | 'manual-form' | 'saving' | 'result';

const GPS_OPTIONS: { value: GpsActivityType; label: string }[] = [
  { value: 'run', label: 'Corrida' },
  { value: 'bike', label: 'Bike' },
];

const MANUAL_OPTIONS: { value: ManualActivityType; label: string }[] = [
  { value: 'swim', label: 'Natacao' },
  { value: 'fight', label: 'Luta' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'other', label: 'Outro' },
];

/** Distancia em metros entre dois pontos — so para exibicao ao vivo, o backend recalcula oficialmente ao salvar. */
function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function NewActivityScreen() {
  const [stage, setStage] = useState<Stage>('select');
  const [selectedType, setSelectedType] = useState<ActivityType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rastreamento GPS
  const [trackingActive, setTrackingActive] = useState(false);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const watchSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);
  // Live Activity: o professor vinculado pode acompanhar via polling. E um
  // bonus, nao o fluxo principal — qualquer falha aqui e engolida em
  // silencio, nunca deve atrapalhar o aluno rastreando a propria atividade.
  const liveActivityIdRef = useRef<string | null>(null);
  const lastLiveUpdateAtRef = useRef(0);

  // Registro manual
  const [durationMinutes, setDurationMinutes] = useState('');
  const [caloriesManual, setCaloriesManual] = useState('');
  const [notes, setNotes] = useState('');

  // Resultado
  const [savedRun, setSavedRun] = useState<Run | null>(null);
  const [savedManual, setSavedManual] = useState<ManualActivity | null>(null);
  const [insight, setInsight] = useState<ActivityInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const isGpsType = selectedType === 'run' || selectedType === 'bike';

  const liveDistanceMeters = useMemo(() => {
    let total = 0;
    for (let i = 1; i < routePoints.length; i++) {
      total += haversineMeters(routePoints[i - 1], routePoints[i]);
    }
    return total;
  }, [routePoints]);

  // Cronometro: atualiza a cada segundo so enquanto o rastreamento esta ativo.
  useEffect(() => {
    if (!trackingActive || !startedAt) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [trackingActive, startedAt]);

  // Envia a posicao atual pro backend (Live Activity), throttled — dispara a
  // cada novo ponto de GPS (routePoints muda), mas so manda de fato se ja se
  // passaram LIVE_UPDATE_THROTTLE_MS desde o ultimo envio.
  useEffect(() => {
    if (!trackingActive || !liveActivityIdRef.current || routePoints.length === 0 || !startedAt) return;
    const now = Date.now();
    if (now - lastLiveUpdateAtRef.current < LIVE_UPDATE_THROTTLE_MS) return;
    lastLiveUpdateAtRef.current = now;

    const activityId = liveActivityIdRef.current;
    const last = routePoints[routePoints.length - 1];
    const elapsed = Math.floor((now - startedAt.getTime()) / 1000);
    const pace = liveDistanceMeters > 0 ? elapsed / (liveDistanceMeters / 1000) : null;

    (async () => {
      // Melhor esforco: so vem algo aqui se o usuario tiver Apple Watch (ou
      // outro dispositivo companion) gravando ativamente por perto — o
      // iPhone sozinho nao tem sensor de FC nem fonte alternativa via
      // HealthKit, entao isso fica null na pratica na maioria dos treinos.
      const heartRate =
        Platform.OS === 'ios' ? await fetchRecentHeartRateBpm(LIVE_HEART_RATE_MAX_AGE_MS).catch(() => null) : null;

      try {
        await updateLiveActivity(activityId, {
          lat: last.lat,
          lng: last.lng,
          distance_meters: liveDistanceMeters,
          elapsed_seconds: elapsed,
          pace_seconds_per_km: pace,
          heart_rate_bpm: heartRate ?? undefined,
        });
      } catch {
        // silencioso de proposito — ver comentario no ref acima
      }
    })();
  }, [routePoints, trackingActive, startedAt, liveDistanceMeters]);

  // Garante que o GPS pare de ser rastreado se o usuario sair da tela sem finalizar.
  useEffect(() => {
    return () => {
      watchSubscriptionRef.current?.remove();
    };
  }, []);

  const handleSelectContinue = async () => {
    if (!selectedType) return;
    setError(null);
    if (isGpsType) {
      await startTracking();
    } else {
      setStage('manual-form');
    }
  };

  const startTracking = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permissao de localizacao negada. Habilite nas configuracoes do celular.');
      return;
    }
    try {
      const first = await Location.getCurrentPositionAsync({});
      const now = new Date();
      const point: RoutePoint = {
        lat: first.coords.latitude,
        lng: first.coords.longitude,
        timestamp: now.toISOString(),
      };
      setRoutePoints([point]);
      setStartedAt(now);
      setFinishedAt(null);
      setElapsedSeconds(0);
      setTrackingActive(true);
      setStage('tracking');

      // Bonus pro professor vinculado acompanhar ao vivo — nao bloqueia nem
      // afeta o rastreamento do proprio aluno se falhar.
      startLiveActivity(selectedType as GpsActivityType)
        .then((live) => {
          liveActivityIdRef.current = live.id;
        })
        .catch(() => {
          liveActivityIdRef.current = null;
        });

      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 4000, distanceInterval: 10 },
        (loc) => {
          setRoutePoints((prev) => [
            ...prev,
            { lat: loc.coords.latitude, lng: loc.coords.longitude, timestamp: new Date(loc.timestamp).toISOString() },
          ]);
          mapRef.current?.animateToRegion(
            {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            500
          );
        }
      );
      watchSubscriptionRef.current = subscription;
    } catch {
      setError('Nao foi possivel obter sua localizacao. Tente novamente.');
    }
  };

  /** Idempotente: seguro chamar mais de uma vez (ex: Finalizar seguido de Descartar). */
  const stopLiveTracking = async () => {
    const id = liveActivityIdRef.current;
    if (!id) return;
    liveActivityIdRef.current = null;
    try {
      await finishLiveActivity(id);
    } catch {
      // silencioso — linha efemera, uma falha aqui nao precisa incomodar o aluno
    }
  };

  const handleFinishTracking = () => {
    watchSubscriptionRef.current?.remove();
    watchSubscriptionRef.current = null;
    setTrackingActive(false);
    const finish = new Date();
    setFinishedAt(finish);
    setElapsedSeconds(Math.floor((finish.getTime() - (startedAt?.getTime() ?? finish.getTime())) / 1000));
    stopLiveTracking();
  };

  const handleDiscardTracking = () => {
    stopLiveTracking();
    setStage('select');
    setSelectedType(null);
    setRoutePoints([]);
    setStartedAt(null);
    setFinishedAt(null);
    setElapsedSeconds(0);
    setError(null);
  };

  const handleSaveRun = async () => {
    if (!startedAt || !selectedType) return;
    const finish = finishedAt ?? new Date();
    setStage('saving');
    setError(null);
    try {
      const run = await createRun({
        activity_type: selectedType as GpsActivityType,
        route_points: routePoints,
        started_at: startedAt.toISOString(),
        finished_at: finish.toISOString(),
      });
      setSavedRun(run);
      setStage('result');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar a atividade.'));
      setStage('tracking');
    }
  };

  const canSubmitManual = Number(durationMinutes) > 0;

  const handleSaveManual = async () => {
    if (!selectedType || !canSubmitManual) {
      setError('Informe a duracao em minutos.');
      return;
    }
    setStage('saving');
    setError(null);
    try {
      const activity = await createManualActivity({
        activity_type: selectedType as ManualActivityType,
        duration_minutes: Math.round(Number(durationMinutes)),
        calories_burned: caloriesManual.trim() ? Number(caloriesManual) : undefined,
        notes: notes.trim() || undefined,
        performed_at: new Date().toISOString(),
      });
      setSavedManual(activity);
      setStage('result');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar a atividade.'));
      setStage('manual-form');
    }
  };

  const handleFetchInsight = async () => {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const data = savedRun ? await getRunInsight(savedRun.id) : savedManual ? await getManualActivityInsight(savedManual.id) : null;
      setInsight(data);
    } catch (err) {
      setInsightError(getApiErrorMessage(err, 'Nao foi possivel gerar a analise desta atividade.'));
    } finally {
      setInsightLoading(false);
    }
  };

  const handleClose = () => router.back();
  const handleDone = () => router.replace('/activity');

  const handleCloseTracking = () => {
    if (trackingActive) {
      Alert.alert('Sair da atividade?', 'O rastreamento em andamento sera perdido.', [
        { text: 'Continuar rastreando', style: 'cancel' },
        { text: 'Sair e descartar', style: 'destructive', onPress: handleDiscardTracking },
      ]);
    } else {
      handleDiscardTracking();
    }
  };

  if (stage === 'tracking') {
    return (
      <View style={styles.trackingFlex}>
        <Pressable style={styles.trackingCloseButton} onPress={handleCloseTracking} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors2.white} />
        </Pressable>

        <MapView
          ref={mapRef}
          style={styles.map}
          showsUserLocation
          initialRegion={{
            latitude: routePoints[0]?.lat ?? 0,
            longitude: routePoints[0]?.lng ?? 0,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          {routePoints.length > 1 && (
            <Polyline
              coordinates={routePoints.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
              strokeColor={colors2.violet}
              strokeWidth={4}
            />
          )}
        </MapView>

        <View style={styles.trackingPanel}>
          <View style={styles.trackingStatsRow}>
            <View style={styles.trackingStat}>
              <Text style={styles.trackingStatNumber}>{formatDuration(elapsedSeconds)}</Text>
              <Text style={styles.trackingStatLabel}>tempo</Text>
            </View>
            <View style={styles.trackingStat}>
              <Text style={styles.trackingStatNumber}>{formatDistanceKm(liveDistanceMeters)}</Text>
              <Text style={styles.trackingStatLabel}>km</Text>
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          {trackingActive ? (
            <Button2 label="Finalizar" onPress={handleFinishTracking} />
          ) : (
            <>
              <Button2 label="Salvar atividade" onPress={handleSaveRun} />
              <Button2 label="Descartar atividade" variant="secondary" onPress={handleDiscardTracking} />
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <ScreenBackground2 style={styles.flex}>
    <KeyboardAvoidingView style={styles.innerFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>{stage === 'result' ? 'Atividade salva' : 'Nova atividade'}</Text>
        <Pressable onPress={handleClose} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors2.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        {stage === 'select' && (
          <>
            <ChoiceGroup2 label="Com GPS" options={GPS_OPTIONS} value={selectedType} onChange={setSelectedType} />
            <ChoiceGroup2
              label="Registro manual"
              options={MANUAL_OPTIONS}
              value={selectedType}
              onChange={setSelectedType}
            />
            <Button2
              label={isGpsType ? 'Iniciar atividade' : 'Continuar'}
              onPress={handleSelectContinue}
              disabled={!selectedType}
            />
          </>
        )}

        {stage === 'manual-form' && (
          <>
            <TextField2
              label="Duracao (minutos)"
              placeholder="Ex: 45"
              keyboardType="number-pad"
              value={durationMinutes}
              onChangeText={setDurationMinutes}
            />
            <TextField2
              label="Calorias (opcional)"
              placeholder="Ex: 320"
              keyboardType="decimal-pad"
              value={caloriesManual}
              onChangeText={setCaloriesManual}
            />
            <TextField2
              label="Notas (opcional)"
              placeholder="Ex: 5 rounds de sparring, treino leve..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />
            <Button2 label="Salvar atividade" onPress={handleSaveManual} disabled={!canSubmitManual} />
          </>
        )}

        {stage === 'saving' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors2.violet} />
            <Text style={styles.savingText}>Salvando atividade...</Text>
          </View>
        )}

        {stage === 'result' && (savedRun || savedManual) && (
          <View style={styles.reviewContainer}>
            <LiquiglassCard style={styles.resultCard}>
              {savedRun ? (
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statNumber}>{formatDistanceKm(savedRun.distance_meters)}</Text>
                    <Text style={styles.statLabel}>km</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNumber}>{formatDuration(savedRun.duration_seconds)}</Text>
                    <Text style={styles.statLabel}>tempo</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNumber}>{formatPace(savedRun.avg_pace_seconds_per_km)}</Text>
                    <Text style={styles.statLabel}>pace</Text>
                  </View>
                </View>
              ) : (
                savedManual && (
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statNumber}>{savedManual.duration_minutes}</Text>
                      <Text style={styles.statLabel}>minutos</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statNumber}>
                        {savedManual.calories_burned != null ? Math.round(savedManual.calories_burned) : '--'}
                      </Text>
                      <Text style={styles.statLabel}>kcal</Text>
                    </View>
                  </View>
                )
              )}
              {savedRun?.calories_burned != null && (
                <Text style={styles.resultExtra}>{Math.round(savedRun.calories_burned)} kcal</Text>
              )}
              {!!savedManual?.notes && <Text style={styles.resultExtra}>{savedManual.notes}</Text>}
            </LiquiglassCard>

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

            <Button2 label="Concluir" onPress={handleDone} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  innerFlex: { flex: 1 },
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
  error: { color: colors2.danger, textAlign: 'center', marginBottom: spacing2.sm },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  centered: { alignItems: 'center', marginTop: spacing2.xl },
  savingText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: spacing2.md },
  reviewContainer: { gap: spacing2.md },

  resultCard: { gap: spacing2.sm },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  statNumber: { ...typography2.metricMono, fontSize: 22 },
  statLabel: { ...typography2.labelCaps, textTransform: 'none', marginTop: 2 },
  resultExtra: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant, marginTop: spacing2.xs },

  insightCard: { gap: spacing2.sm },
  insightSummary: { ...typography2.bodyMd },
  insightHighlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  insightHighlight: { ...typography2.bodyMd, fontSize: 14, fontWeight: '600', flex: 1 },
  insightSuggestion: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },

  trackingFlex: { flex: 1, backgroundColor: colors2.background },
  trackingCloseButton: {
    position: 'absolute',
    top: spacing2.xl,
    left: spacing2.lg,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: { flex: 1 },
  trackingPanel: {
    backgroundColor: colors2.surfaceContainer,
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
    padding: spacing2.lg,
    paddingBottom: spacing2.xl,
    gap: spacing2.sm,
  },
  trackingStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing2.sm },
  trackingStat: { alignItems: 'center' },
  trackingStatNumber: { ...typography2.metricMono, fontSize: 28 },
  trackingStatLabel: { ...typography2.labelCaps, textTransform: 'none', marginTop: 2 },
});
