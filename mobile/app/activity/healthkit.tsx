import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  createManualActivity,
  createRun,
  formatDistanceKm,
  formatDuration,
  listManualActivities,
  listRuns,
  ManualActivity,
  parseUtcDate,
  Run,
} from '@/services/activities';
import {
  fetchRecentWorkouts,
  HEALTH_SOURCE_LABEL,
  HealthKitWorkout,
  isHealthAvailable,
  openHealthSettings,
  requestHealthPermissions,
} from '@/services/health';
import { colors, radius, spacing, typography } from '@/constants/theme';

type Stage = 'idle' | 'checking' | 'list';

const DAYS_TO_LOOK_BACK = 30;
// Nao ha um jeito confiavel de marcar um HKWorkout como "ja importado" no
// backend, entao a deteccao de duplicata e por proximidade de data/hora com
// atividades ja salvas — 5 minutos cobre a variacao natural entre o inicio
// registrado pelo relogio e o que foi salvo no app.
const DUPLICATE_TOLERANCE_MS = 5 * 60 * 1000;

function isAlreadyImported(workout: HealthKitWorkout, runs: Run[], manualActivities: ManualActivity[]): boolean {
  const workoutStart = parseUtcDate(workout.startedAt).getTime();
  const matchesRun = runs.some(
    (run) => Math.abs(parseUtcDate(run.started_at).getTime() - workoutStart) < DUPLICATE_TOLERANCE_MS
  );
  if (matchesRun) return true;
  return manualActivities.some(
    (activity) => Math.abs(parseUtcDate(activity.performed_at).getTime() - workoutStart) < DUPLICATE_TOLERANCE_MS
  );
}

export default function HealthKitImportScreen() {
  const [stage, setStage] = useState<Stage>('idle');
  const [workouts, setWorkouts] = useState<HealthKitWorkout[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  // Guarda SINCRONA de reentrancia: setImportingId (setState) so re-renderiza
  // o botao como disabled no proximo frame, entao um toque duplo rapido
  // conseguia disparar handleImport 2x pro mesmo treino -> 2 POST /activities
  // identicos. Este ref e atualizado na hora, antes de qualquer await.
  const importingRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fica true quando algum treino foi importado SEM a rota GPS por falta da
  // permissao "Rotas de exercicio" do Health Connect (so Android -- ver
  // routeUnavailable em HealthKitWorkout / extractExerciseRoutePoints). O
  // aviso persiste mesmo depois do treino sair da lista.
  const [routeImportSkipped, setRouteImportSkipped] = useState(false);

  const handleCheck = async () => {
    setStage('checking');
    setError(null);
    try {
      // iOS -> Apple HealthKit, Android -> Health Connect (ver services/health.ts).
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new Error('Importar treinos so esta disponivel em iPhone ou Android.');
      }
      const available = await isHealthAvailable();
      if (!available) {
        throw new Error(`${HEALTH_SOURCE_LABEL} nao esta disponivel neste dispositivo.`);
      }
      const granted = await requestHealthPermissions();
      if (!granted) {
        throw new Error(`Permissao do ${HEALTH_SOURCE_LABEL} negada. Habilite nas configuracoes do celular.`);
      }

      const since = new Date(Date.now() - DAYS_TO_LOOK_BACK * 24 * 60 * 60 * 1000);
      const [hkWorkouts, runs, manualActivities] = await Promise.all([
        fetchRecentWorkouts(since),
        listRuns(),
        listManualActivities(),
      ]);

      setWorkouts(hkWorkouts.filter((workout) => !isAlreadyImported(workout, runs, manualActivities)));
      setStage('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Nao foi possivel verificar o ${HEALTH_SOURCE_LABEL}.`);
      setStage('idle');
    }
  };

  const handleImport = async (workout: HealthKitWorkout) => {
    // Ja ha uma importacao em andamento (inclusive um toque duplo neste
    // mesmo botao) -> ignora.
    if (importingRef.current) return;
    importingRef.current = workout.id;
    setImportingId(workout.id);
    setError(null);
    try {
      if (workout.routePoints && workout.routePoints.length > 0) {
        await createRun({
          activity_type: workout.activityType,
          route_points: workout.routePoints,
          started_at: workout.startedAt,
          finished_at: workout.finishedAt,
        });
      } else {
        await createManualActivity({
          activity_type: workout.activityType,
          duration_minutes: Math.max(1, Math.round(workout.durationSeconds / 60)),
          calories_burned: workout.caloriesBurned,
          performed_at: workout.startedAt,
        });
        // Rota existia no Health Connect mas nao pode ser lida -> importado
        // como atividade manual (sem mapa/splits). Avisa o usuario.
        if (workout.routeUnavailable) setRouteImportSkipped(true);
      }
      setWorkouts((prev) => prev.filter((w) => w.id !== workout.id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel importar este treino.'));
    } finally {
      importingRef.current = null;
      setImportingId(null);
    }
  };

  const showRouteWarning = routeImportSkipped || workouts.some((w) => w.routeUnavailable);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Importar treinos</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Verifique treinos recentes no {HEALTH_SOURCE_LABEL} e importe os que ainda nao estao no Tryv.
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {stage === 'idle' && <Button label={`Verificar ${HEALTH_SOURCE_LABEL}`} onPress={handleCheck} />}

        {stage === 'checking' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.checkingText}>Procurando treinos...</Text>
          </View>
        )}

        {stage === 'list' && showRouteWarning && (
          <Card style={styles.warningCard}>
            <View style={styles.warningRow}>
              <Ionicons name="map-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.warningTitle}>Rota de GPS não importada</Text>
            </View>
            <Text style={styles.warningText}>
              O {HEALTH_SOURCE_LABEL} tem a rota de GPS deste treino, mas o Tryv não conseguiu lê-la —
              falta a permissão "Rotas de exercício". Sem ela, o treino entra como atividade manual (sem
              mapa, distância ou splits). Ative "Rotas de exercício" para o Tryv em Ajustes →{' '}
              {HEALTH_SOURCE_LABEL} → Tryv e importe de novo.
            </Text>
            <Button label={`Abrir ${HEALTH_SOURCE_LABEL}`} variant="secondary" onPress={openHealthSettings} />
          </Card>
        )}

        {stage === 'list' && (
          <>
            {workouts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle-outline" size={32} color={colors.textMuted} />
                <Text style={styles.emptyText}>Nenhum treino novo encontrado.</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {workouts.map((workout) => {
                  const label = ACTIVITY_TYPE_LABELS[workout.activityType];
                  const icon = ACTIVITY_TYPE_ICONS[workout.activityType];
                  const hasRoute = !!workout.routePoints && workout.routePoints.length > 0;
                  const isImporting = importingId === workout.id;

                  return (
                    <Card key={workout.id} style={styles.workoutCard}>
                      <View style={styles.workoutRow}>
                        <View style={styles.iconWrap}>
                          <Ionicons name={icon} size={22} color={colors.accent} />
                        </View>
                        <View style={styles.workoutInfo}>
                          <Text style={styles.workoutLabel}>{label}</Text>
                          <Text style={styles.workoutStats}>
                            {formatDuration(workout.durationSeconds)}
                            {workout.distanceMeters != null && `  •  ${formatDistanceKm(workout.distanceMeters)} km`}
                            {workout.caloriesBurned != null && `  •  ${Math.round(workout.caloriesBurned)} kcal`}
                          </Text>
                          <Text style={styles.workoutDate}>
                            {parseUtcDate(workout.startedAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {hasRoute
                              ? '  •  com rota de GPS'
                              : workout.routeUnavailable
                                ? '  •  rota de GPS indisponível (permissão)'
                                : ''}
                          </Text>
                        </View>
                      </View>
                      <Button
                        label="Importar"
                        variant="secondary"
                        onPress={() => handleImport(workout)}
                        loading={isImporting}
                        disabled={importingId != null && !isImporting}
                      />
                    </Card>
                  );
                })}
              </View>
            )}

            <Button label="Verificar novamente" variant="secondary" onPress={handleCheck} />
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
  subtitle: { ...typography.bodySecondary },
  error: { color: colors.danger, textAlign: 'center' },
  centered: { alignItems: 'center', marginTop: spacing.xl },
  checkingText: { ...typography.bodySecondary, marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },

  warningCard: { gap: spacing.sm },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warningTitle: { ...typography.body, fontWeight: '600' },
  warningText: { ...typography.bodySecondary },

  list: { gap: spacing.sm },
  workoutCard: { gap: spacing.md },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutInfo: { flex: 1, gap: spacing.xs },
  workoutLabel: { ...typography.body, fontWeight: '600' },
  workoutStats: { ...typography.bodySecondary },
  workoutDate: { ...typography.caption },
});
