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

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { TextField } from '@/components/TextField';
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
import { colors, radius, spacing, typography } from '@/constants/theme';

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

  const handleFinishTracking = () => {
    watchSubscriptionRef.current?.remove();
    watchSubscriptionRef.current = null;
    setTrackingActive(false);
    const finish = new Date();
    setFinishedAt(finish);
    setElapsedSeconds(Math.floor((finish.getTime() - (startedAt?.getTime() ?? finish.getTime())) / 1000));
  };

  const handleDiscardTracking = () => {
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
          <Ionicons name="close" size={22} color={colors.white} />
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
              strokeColor={colors.accent}
              strokeWidth={4}
            />
          )}
        </MapView>

        <View style={styles.trackingPanel}>
          <View style={styles.trackingStatsRow}>
            <View style={styles.trackingStat}>
              <Text style={typography.statNumber}>{formatDuration(elapsedSeconds)}</Text>
              <Text style={typography.statLabel}>tempo</Text>
            </View>
            <View style={styles.trackingStat}>
              <Text style={typography.statNumber}>{formatDistanceKm(liveDistanceMeters)}</Text>
              <Text style={typography.statLabel}>km</Text>
            </View>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          {trackingActive ? (
            <Button label="Finalizar" onPress={handleFinishTracking} />
          ) : (
            <>
              <Button label="Salvar atividade" onPress={handleSaveRun} />
              <Button label="Descartar atividade" variant="secondary" onPress={handleDiscardTracking} />
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>{stage === 'result' ? 'Atividade salva' : 'Nova atividade'}</Text>
        <Pressable onPress={handleClose} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        {stage === 'select' && (
          <>
            <ChoiceGroup label="Com GPS" options={GPS_OPTIONS} value={selectedType} onChange={setSelectedType} />
            <ChoiceGroup
              label="Registro manual"
              options={MANUAL_OPTIONS}
              value={selectedType}
              onChange={setSelectedType}
            />
            <Button
              label={isGpsType ? 'Iniciar atividade' : 'Continuar'}
              onPress={handleSelectContinue}
              disabled={!selectedType}
            />
          </>
        )}

        {stage === 'manual-form' && (
          <>
            <TextField
              label="Duracao (minutos)"
              placeholder="Ex: 45"
              keyboardType="number-pad"
              value={durationMinutes}
              onChangeText={setDurationMinutes}
            />
            <TextField
              label="Calorias (opcional)"
              placeholder="Ex: 320"
              keyboardType="decimal-pad"
              value={caloriesManual}
              onChangeText={setCaloriesManual}
            />
            <TextField
              label="Notas (opcional)"
              placeholder="Ex: 5 rounds de sparring, treino leve..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />
            <Button label="Salvar atividade" onPress={handleSaveManual} disabled={!canSubmitManual} />
          </>
        )}

        {stage === 'saving' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.savingText}>Salvando atividade...</Text>
          </View>
        )}

        {stage === 'result' && (savedRun || savedManual) && (
          <View style={styles.reviewContainer}>
            <Card style={styles.resultCard}>
              {savedRun ? (
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={typography.statNumber}>{formatDistanceKm(savedRun.distance_meters)}</Text>
                    <Text style={typography.statLabel}>km</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={typography.statNumber}>{formatDuration(savedRun.duration_seconds)}</Text>
                    <Text style={typography.statLabel}>tempo</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={typography.statNumber}>{formatPace(savedRun.avg_pace_seconds_per_km)}</Text>
                    <Text style={typography.statLabel}>pace</Text>
                  </View>
                </View>
              ) : (
                savedManual && (
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={typography.statNumber}>{savedManual.duration_minutes}</Text>
                      <Text style={typography.statLabel}>minutos</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={typography.statNumber}>
                        {savedManual.calories_burned != null ? Math.round(savedManual.calories_burned) : '--'}
                      </Text>
                      <Text style={typography.statLabel}>kcal</Text>
                    </View>
                  </View>
                )
              )}
              {savedRun?.calories_burned != null && (
                <Text style={styles.resultExtra}>{Math.round(savedRun.calories_burned)} kcal</Text>
              )}
              {!!savedManual?.notes && <Text style={styles.resultExtra}>{savedManual.notes}</Text>}
            </Card>

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

            <Button label="Concluir" onPress={handleDone} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  error: { color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  centered: { alignItems: 'center', marginTop: spacing.xl },
  savingText: { ...typography.bodySecondary, marginTop: spacing.md },
  reviewContainer: { gap: spacing.md },

  resultCard: { gap: spacing.sm },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  resultExtra: { ...typography.bodySecondary, marginTop: spacing.xs },

  insightCard: { gap: spacing.sm },
  insightSummary: { ...typography.body },
  insightHighlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  insightHighlight: { ...typography.bodySecondary, fontWeight: '600', flex: 1 },
  insightSuggestion: { ...typography.bodySecondary },

  trackingFlex: { flex: 1, backgroundColor: colors.background },
  trackingCloseButton: {
    position: 'absolute',
    top: spacing.xxl,
    left: spacing.lg,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: { flex: 1 },
  trackingPanel: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  trackingStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.sm },
  trackingStat: { alignItems: 'center' },
});
