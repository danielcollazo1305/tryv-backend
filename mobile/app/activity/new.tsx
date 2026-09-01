import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
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
import { router, useLocalSearchParams } from 'expo-router';

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
import {
  clearBackgroundTrackingState,
  requestBackgroundLocationUpgrade,
  shouldOfferBackgroundLocationUpgrade,
  startBackgroundTracking,
  stopBackgroundTrackingAndFlush,
} from '@/services/backgroundLocation';
import { fetchRecentHeartRateBpm } from '@/services/health';
import { finishLiveActivity, startLiveActivity, updateLiveActivity } from '@/services/liveActivities';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

// Intervalo minimo entre atualizacoes ao vivo enviadas pro backend — o GPS
// pinga a cada ~4s, mas o professor acompanhando nao precisa de mais que
// isso; throttle evita chamadas de rede desnecessarias.
const LIVE_UPDATE_THROTTLE_MS = 5000;
// Uma leitura de FC mais velha que isso nao e mostrada como "ao vivo" —
// melhor omitir do que enganar o professor com um numero de minutos atras.
const LIVE_HEART_RATE_MAX_AGE_MS = 2 * 60 * 1000;
// Distancia minima pra calcular pace ao vivo (mesmo valor de
// distanceInterval do watchPositionAsync abaixo — ruido de GPS parado
// ainda pode gerar um "movimento" de poucos centimetros entre pings do
// timeInterval, mesmo sem deslocamento real). Sem esse piso, elapsed /
// (distancia quase zero) vira um numero absurdo (bug: pace mostrando
// "421894213468:56 / km" nos primeiros segundos de corrida) — simplesmente
// checar "> 0" nao bastava, precisa de uma distancia minima que faca
// sentido pra um calculo de pace de verdade.
const MIN_DISTANCE_METERS_FOR_PACE = 10;

type Stage = 'select' | 'tracking' | 'manual-form' | 'saving' | 'result';

const GPS_OPTIONS: { value: GpsActivityType; label: string }[] = [
  { value: 'run', label: 'Corrida' },
  { value: 'bike', label: 'Bike' },
  { value: 'walk', label: 'Caminhada' },
];

const GPS_TYPES: GpsActivityType[] = ['run', 'bike', 'walk'];

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
  // Pre-selecao de tipo (item 3 da task "atividade-entrada-unica") — vem
  // do seletor "Iniciar atividade" da aba Treino. So GPS types fazem
  // sentido aqui (o seletor so oferece Corrida/Bike/Caminhada); um valor
  // invalido/ausente simplesmente cai no fluxo normal de selecao manual.
  const { type: presetType } = useLocalSearchParams<{ type?: string }>();
  const isValidGpsPreset = (value?: string): value is GpsActivityType =>
    !!value && (GPS_TYPES as string[]).includes(value);

  const [stage, setStage] = useState<Stage>('select');
  const [selectedType, setSelectedType] = useState<ActivityType | null>(
    isValidGpsPreset(presetType) ? presetType : null
  );
  const [error, setError] = useState<string | null>(null);

  // Rastreamento GPS
  const [trackingActive, setTrackingActive] = useState(false);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const watchSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);

  // Upgrade opcional pra rastreamento em segundo plano (item 4) — nunca
  // pedido na primeira tela, so oferecido depois que o rastreamento em
  // primeiro plano ja esta rolando (ver useEffect abaixo).
  const [showBackgroundUpsell, setShowBackgroundUpsell] = useState(false);
  const appStateRef = useRef(AppState.currentState);
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

  const isGpsType = isValidGpsPreset(selectedType ?? undefined);

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
    const pace = liveDistanceMeters >= MIN_DISTANCE_METERS_FOR_PACE ? elapsed / (liveDistanceMeters / 1000) : null;

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
      clearBackgroundTrackingState();
    };
  }, []);

  // Auto-inicio quando chega com um tipo pre-selecionado (seletor "Iniciar
  // atividade" da aba Treino) — pula a etapa de selecao manual. Guard por
  // ref pra nunca disparar 2x (ex: double-invoke de efeitos em dev).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current || !isValidGpsPreset(presetType)) return;
    autoStartedRef.current = true;
    startTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rastreamento em segundo plano (item 4) — so entra em acao quando o app
  // de fato vai pro background DURANTE uma corrida ativa. O
  // watchPositionAsync em primeiro plano (startTracking abaixo) nao e
  // tocado por este efeito, continua sendo a fonte principal sempre que o
  // app esta em primeiro plano.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (!trackingActive) return;

      if (prevState === 'active' && nextState.match(/inactive|background/)) {
        startBackgroundTracking();
      } else if (prevState.match(/inactive|background/) && nextState === 'active') {
        stopBackgroundTrackingAndFlush().then((backgroundPoints) => {
          if (backgroundPoints.length === 0) return;
          setRoutePoints((prev) => [...prev, ...backgroundPoints]);
        });
      }
    });
    return () => subscription.remove();
  }, [trackingActive]);

  // Oferece o upgrade pra "Always" so depois que o rastreamento em
  // primeiro plano ja esta rolando de verdade (nunca na tela inicial) — e
  // so se ainda fizer sentido perguntar (ver shouldOfferBackgroundLocationUpgrade).
  useEffect(() => {
    if (!trackingActive) return;
    shouldOfferBackgroundLocationUpgrade().then(setShowBackgroundUpsell);
  }, [trackingActive]);

  const handleActivateBackgroundUpsell = async () => {
    setShowBackgroundUpsell(false);
    await requestBackgroundLocationUpgrade();
  };

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
        alt: first.coords.altitude,
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
            {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              timestamp: new Date(loc.timestamp).toISOString(),
              alt: loc.coords.altitude,
            },
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
    setShowBackgroundUpsell(false);
    const finish = new Date();
    setFinishedAt(finish);
    setElapsedSeconds(Math.floor((finish.getTime() - (startedAt?.getTime() ?? finish.getTime())) / 1000));
    stopLiveTracking();
    clearBackgroundTrackingState();
  };

  const handleDiscardTracking = () => {
    stopLiveTracking();
    clearBackgroundTrackingState();
    setStage('select');
    setSelectedType(null);
    setRoutePoints([]);
    setStartedAt(null);
    setFinishedAt(null);
    setElapsedSeconds(0);
    setError(null);
    setShowBackgroundUpsell(false);
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
    const livePaceSecondsPerKm =
      liveDistanceMeters >= MIN_DISTANCE_METERS_FOR_PACE ? elapsedSeconds / (liveDistanceMeters / 1000) : null;

    return (
      <View style={styles.trackingFlex}>
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

        <Pressable style={styles.trackingCloseButton} onPress={handleCloseTracking} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors2.white} />
        </Pressable>

        {/* Card flutuante no topo com as metricas ao vivo — layout Strava (item 3 da task). */}
        <LiquiglassCard style={styles.trackingStatsCard}>
          <View style={styles.trackingStatsRow}>
            <View style={styles.trackingStat}>
              <Text style={styles.trackingStatNumber}>{formatDuration(elapsedSeconds)}</Text>
              <Text style={styles.trackingStatLabel}>tempo</Text>
            </View>
            <View style={styles.trackingStatDivider} />
            <View style={styles.trackingStat}>
              <Text style={styles.trackingStatNumber}>{formatDistanceKm(liveDistanceMeters)}</Text>
              <Text style={styles.trackingStatLabel}>km</Text>
            </View>
            <View style={styles.trackingStatDivider} />
            <View style={styles.trackingStat}>
              <Text style={styles.trackingStatNumber}>{formatPace(livePaceSecondsPerKm)}</Text>
              <Text style={styles.trackingStatLabel}>pace</Text>
            </View>
          </View>
        </LiquiglassCard>

        {/*
          Upsell opcional de segundo plano (item 4) — so aparece uma vez,
          enquanto a permissao "Always" ainda nao foi respondida (ver
          shouldOfferBackgroundLocationUpgrade). Dispensavel, nunca
          bloqueia o rastreamento em primeiro plano que ja esta rolando.
        */}
        {showBackgroundUpsell && (
          <LiquiglassCard style={styles.backgroundUpsellCard}>
            <View style={styles.backgroundUpsellTextWrap}>
              <Ionicons name="moon" size={16} color={colors2.primary} />
              <Text style={styles.backgroundUpsellText}>Continuar gravando com a tela apagada?</Text>
            </View>
            <View style={styles.backgroundUpsellButtons}>
              <Pressable onPress={() => setShowBackgroundUpsell(false)} hitSlop={8}>
                <Text style={styles.backgroundUpsellDismiss}>Agora nao</Text>
              </Pressable>
              <Pressable onPress={handleActivateBackgroundUpsell} hitSlop={8}>
                <Text style={styles.backgroundUpsellActivate}>Ativar</Text>
              </Pressable>
            </View>
          </LiquiglassCard>
        )}

        {!!error && <Text style={styles.trackingError}>{error}</Text>}

        <View style={styles.trackingBottomArea}>
          {trackingActive ? (
            <Pressable style={styles.trackingStopButton} onPress={handleFinishTracking}>
              <Ionicons name="stop" size={26} color={colors2.white} />
            </Pressable>
          ) : (
            <View style={styles.trackingResultButtons}>
              <Button2 label="Salvar atividade" onPress={handleSaveRun} />
              <Button2 label="Descartar atividade" variant="secondary" onPress={handleDiscardTracking} />
            </View>
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
  map: { ...StyleSheet.absoluteFillObject },

  // Card flutuante de metricas no topo (layout Strava) — flutua sobre o
  // mapa em vez de ficar dentro de um painel docado embaixo.
  trackingStatsCard: {
    position: 'absolute',
    top: spacing2.xl + 48,
    left: spacing2.lg,
    right: spacing2.lg,
  },
  trackingStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  trackingStat: { alignItems: 'center', flex: 1 },
  trackingStatDivider: { width: 1, height: 32, backgroundColor: colors2.outlineVariant },
  trackingStatNumber: { ...typography2.metricMono, fontSize: 24 },
  trackingStatLabel: { ...typography2.labelCaps, textTransform: 'none', marginTop: 2, color: colors2.onSurfaceVariant },

  backgroundUpsellCard: {
    position: 'absolute',
    bottom: 148,
    left: spacing2.lg,
    right: spacing2.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing2.sm,
  },
  backgroundUpsellTextWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs, flex: 1 },
  backgroundUpsellText: { ...typography2.bodyMd, fontSize: 13, flexShrink: 1 },
  backgroundUpsellButtons: { flexDirection: 'row', gap: spacing2.md },
  backgroundUpsellDismiss: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  backgroundUpsellActivate: { ...typography2.bodyMd, fontSize: 13, fontWeight: '700', color: colors2.primary },

  trackingError: {
    position: 'absolute',
    bottom: 148,
    left: spacing2.lg,
    right: spacing2.lg,
    color: colors2.white,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius2.md,
    padding: spacing2.sm,
    textAlign: 'center',
  },

  trackingBottomArea: {
    position: 'absolute',
    bottom: spacing2.xl,
    left: spacing2.lg,
    right: spacing2.lg,
    alignItems: 'center',
  },
  trackingStopButton: {
    width: 72,
    height: 72,
    borderRadius: radius2.pill,
    backgroundColor: colors2.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors2.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  trackingResultButtons: { width: '100%', gap: spacing2.sm },
});
