import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

import { GlassCard } from '@/components/GlassCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { MuscleDiagram } from '@/components/MuscleDiagram';
import { getDayMuscleGroups, getExerciseInfo } from '@/constants/exerciseLibrary';
import { WorkoutDay, WorkoutLastExercise, getLastExercisePerformance } from '@/services/workouts';
import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

/** "40kg × 10" a partir da ULTIMA serie com peso+reps preenchidos — null quando nenhuma serie da sessao passada tem os 2 dados (ex: so marcada como concluida, sem numero). */
function formatLastPerformance(last: WorkoutLastExercise | null): string | null {
  if (!last) return null;
  const withData = last.sets.filter((set) => set.weight_kg != null && set.reps != null);
  if (withData.length === 0) return null;
  const mostRecent = withData[withData.length - 1];
  return `${mostRecent.weight_kg}kg × ${mostRecent.reps}`;
}

/** Estado local (nao salvo ainda) de uma serie sendo registrada — valores como texto pra aceitar digitacao livre (vazio, "22,5" etc.) antes de virar numero no save. */
export interface SetEntry {
  weightKg: string;
  reps: string;
  completed: boolean;
}

function buildDefaultSets(count: number): SetEntry[] {
  return Array.from({ length: Math.max(count, 1) }, () => ({ weightKg: '', reps: '', completed: false }));
}

/**
 * Player de verdade — instalado nesta tarefa (expo-video) porque agora
 * existe uma fonte real de video_url (exercicio de plano source='trainer',
 * anexado pelo profissional ao montar o plano em
 * trainers/students/[studentId]/workout-plan.tsx). Componente separado (em
 * vez de um if dentro de ExerciseVideoBlock) porque useVideoPlayer e um
 * hook — so pode ser chamado incondicionalmente dentro de um componente
 * que so monta quando ha videoUrl de verdade.
 */
function ExerciseVideoPlayer({ videoUrl }: { videoUrl: string }) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
  });

  return (
    <VideoView
      style={styles.video}
      player={player}
      allowsFullscreen
      allowsPictureInPicture
      nativeControls
    />
  );
}

/**
 * Video de execucao por exercicio:
 * - Plano de IA: video vem da biblioteca generica do proprio app
 *   (ExerciseLibraryEntry.videoUrl, ver constants/exerciseLibrary.ts).
 * - Plano de Personal Trainer: video vem de exercise.video_url (o
 *   profissional anexa ao montar o plano) — dependencia que existia
 *   documentada aqui ("nao existe endpoint pro trainer atribuir plano")
 *   foi resolvida nesta tarefa.
 * exercise.video_url tem prioridade sobre a biblioteca generica quando os
 * dois existirem (nunca deveriam coexistir na pratica, ja que um exercicio
 * de plano de trainer normalmente nao bate por nome com a biblioteca, mas
 * o video real e especifico do profissional teria precedencia mesmo assim).
 */
function ExerciseVideoBlock({ videoUrl, isLight }: { videoUrl?: string | null; isLight: boolean }) {
  if (videoUrl) {
    return <ExerciseVideoPlayer videoUrl={videoUrl} />;
  }
  const s = isLight ? stylesLight : styles;
  return (
    <View style={s.videoPlaceholder}>
      <Ionicons name="play-circle-outline" size={20} color={isLight ? colors3.onSurfaceVariant : colors2.onSurfaceVariant} />
      <Text style={s.videoPlaceholderText}>Video de execucao em breve</Text>
    </View>
  );
}

/**
 * Linhas de peso/reps por serie de um exercicio. So aparece quando o pai
 * passa log/onSetsChange (plano ja salvo, com plan_id pra associar a
 * sessao) — na etapa de revisao do gerador de treino (plano ainda nao
 * salvo), esses props ficam undefined e a secao nao renderiza, ja que nao
 * haveria onde persistir o registro. Exportado — reaproveitado tambem por
 * FreeWorkoutLogView.tsx (sessao livre, sem plano/dia/exercicio-indice,
 * ainda no tema escuro — por isso o variant abaixo, default 'dark').
 */
export function SetLogSection({
  plannedSets,
  sets,
  onChange,
  exerciseName,
  variant = 'dark',
}: {
  plannedSets: number;
  sets: SetEntry[] | undefined;
  onChange: (sets: SetEntry[]) => void;
  /**
   * Nome do exercicio pra buscar o hint "Última vez: Xkg × Y" (GET
   * /workout-sessions/last-exercise). Opcional pra nao quebrar nenhum
   * outro uso futuro deste componente que nao tenha nome (nao existe hoje,
   * os 2 call sites atuais sempre passam).
   */
  exerciseName?: string;
  /** 'dark' (padrao) = colors2, usado por FreeWorkoutLogView.tsx e pela etapa de revisao do gerador de treino (ainda escuros). 'light' = colors3, so via WorkoutDayCard/WorkoutPlanView ja migrados. */
  variant?: 'dark' | 'light';
}) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
  const rows = sets ?? buildDefaultSets(plannedSets);
  const [lastPerformance, setLastPerformance] = useState<WorkoutLastExercise | null>(null);

  useEffect(() => {
    if (!exerciseName) return;
    let active = true;
    getLastExercisePerformance(exerciseName)
      .then((result) => {
        if (active) setLastPerformance(result);
      })
      .catch(() => {
        if (active) setLastPerformance(null);
      });
    return () => {
      active = false;
    };
  }, [exerciseName]);

  const updateRow = (index: number, patch: Partial<SetEntry>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const addSet = () => {
    onChange([...rows, { weightKg: '', reps: '', completed: false }]);
  };

  const lastPerformanceLabel = formatLastPerformance(lastPerformance);
  const mutedColor = isLight ? colors3.onSurfaceVariant : colors2.onSurfaceVariant;

  return (
    <View style={s.logSection}>
      {!!lastPerformanceLabel && (
        <View style={s.lastPerformanceRow}>
          <Ionicons name="time-outline" size={12} color={mutedColor} />
          <Text style={s.lastPerformanceText}>Última vez: {lastPerformanceLabel}</Text>
        </View>
      )}
      <View style={s.logHeaderRow}>
        <Text style={[s.logHeaderCell, s.logSerieCell]}>Serie</Text>
        <Text style={[s.logHeaderCell, s.logInputCell]}>Peso (kg)</Text>
        <Text style={[s.logHeaderCell, s.logInputCell]}>Reps</Text>
        <View style={s.logCheckCell} />
      </View>
      {rows.map((row, index) => (
        <View key={index} style={s.logRow}>
          <Text style={[s.logSerieText, s.logSerieCell]}>{index + 1}</Text>
          <TextInput
            style={[s.logInput, s.logInputCell]}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={mutedColor}
            value={row.weightKg}
            onChangeText={(text) => updateRow(index, { weightKg: text })}
          />
          <TextInput
            style={[s.logInput, s.logInputCell]}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={mutedColor}
            value={row.reps}
            onChangeText={(text) => updateRow(index, { reps: text })}
          />
          <Pressable
            style={s.logCheckCell}
            hitSlop={8}
            onPress={() => updateRow(index, { completed: !row.completed })}
          >
            <View style={[s.checkCircle, row.completed && s.checkCircleDone]}>
              {row.completed && <Ionicons name="checkmark" size={14} color={isLight ? colors3.white : colors2.white} />}
            </View>
          </Pressable>
        </View>
      ))}
      <Pressable style={s.addSetButton} onPress={addSet} hitSlop={8}>
        <Ionicons name="add-circle-outline" size={16} color={isLight ? colors3.primary : colors2.primary} />
        <Text style={s.addSetText}>Adicionar serie</Text>
      </Pressable>
    </View>
  );
}

interface WorkoutDayCardProps {
  day: WorkoutDay;
  /** Registro de peso/reps por indice de exercicio — omitir esconde a secao de registro (ver SetLogSection). */
  log?: Record<number, SetEntry[]>;
  onSetsChange?: (exerciseIndex: number, sets: SetEntry[]) => void;
  /** 'dark' (padrao) = colors2/LiquiglassCard, usado por FreeWorkoutLogView.tsx (indiretamente via SetLogSection) e pela revisao do gerador de treino (via WorkoutPlanView, ainda escuros). 'light' = colors3/GlassCard, so quando o pai (WorkoutPlanView) tambem estiver em variant="light". */
  variant?: 'dark' | 'light';
}

export function WorkoutDayCard({ day, log, onSetsChange, variant = 'dark' }: WorkoutDayCardProps) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
  const Card = isLight ? GlassCard : LiquiglassCard;
  const hasSummaryStats = day.estimated_duration_minutes != null || day.estimated_calories != null;
  const muscleGroups = getDayMuscleGroups(day.exercises.map((exercise) => exercise.name));

  return (
    <View style={s.wrapper}>
      <View style={s.dayHeader}>
        <Text style={s.dayName}>{day.day}</Text>
        <Text style={s.focus}>{day.focus}</Text>
      </View>

      {/* MuscleDiagram fora do escopo desta migracao — continua no tema
          escuro internamente (LiquiglassCard/colors2 proprios), mesmo
          dentro de um WorkoutDayCard claro. Decisao de migracao a parte. */}
      <MuscleDiagram muscles={muscleGroups} />

      {hasSummaryStats && (
        <View style={s.statsRow}>
          {day.estimated_duration_minutes != null && (
            <Card style={s.statTile} padding={isLight ? spacing3.md : spacing2.md}>
              <View style={s.statIconWrap}>
                <Ionicons name="time" size={18} color={isLight ? colors3.primary : colors2.violet} />
              </View>
              <Text style={s.statValue}>
                {day.estimated_duration_minutes}
                <Text style={s.statUnit}> MIN</Text>
              </Text>
            </Card>
          )}
          {day.estimated_calories != null && (
            <Card style={s.statTile} padding={isLight ? spacing3.md : spacing2.md}>
              <View style={[s.statIconWrap, s.statIconWrapDanger]}>
                <Ionicons name="flame" size={18} color={isLight ? colors3.error : colors2.danger} />
              </View>
              <Text style={s.statValue}>
                {day.estimated_calories}
                <Text style={s.statUnit}> KCAL</Text>
              </Text>
            </Card>
          )}
        </View>
      )}

      <Text style={s.sectionTitle}>Exercícios</Text>
      <View style={s.exerciseList}>
        {day.exercises.map((exercise, index) => (
          <Card key={`${exercise.name}-${index}`} style={s.exerciseCard} padding={isLight ? spacing3.md : spacing2.md}>
            <View style={s.exerciseRow}>
              <View style={s.exerciseIconWrap}>
                <Ionicons name="barbell" size={18} color={isLight ? colors3.primary : colors2.primary} />
              </View>
              <View style={s.exerciseInfo}>
                <Text style={s.exerciseName}>{exercise.name}</Text>
                <View style={s.exerciseMetaRow}>
                  <Text style={s.exerciseSets}>
                    {exercise.sets} x {exercise.reps}
                  </Text>
                  <View style={s.exerciseMetaDot} />
                  <View style={s.exerciseRestRow}>
                    <Ionicons name="time-outline" size={14} color={isLight ? colors3.onSurfaceVariant : colors2.onSurfaceVariant} />
                    <Text style={s.exerciseRest}>{exercise.rest_seconds}s</Text>
                  </View>
                </View>
              </View>
            </View>
            {!!exercise.notes && (
              <View style={s.noteBox}>
                <Ionicons name="information-circle" size={16} color={isLight ? colors3.primary : colors2.primary} />
                <Text style={s.noteText}>{exercise.notes}</Text>
              </View>
            )}
            <ExerciseVideoBlock videoUrl={exercise.video_url ?? getExerciseInfo(exercise.name)?.videoUrl} isLight={isLight} />
            {!!onSetsChange && (
              <SetLogSection
                plannedSets={exercise.sets}
                sets={log?.[index]}
                onChange={(sets) => onSetsChange(index, sets)}
                exerciseName={exercise.name}
                variant={variant}
              />
            )}
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing2.md },
  dayHeader: { gap: 2 },
  dayName: { ...typography2.headlineMd, fontSize: 20 },
  focus: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },

  statsRow: { flexDirection: 'row', gap: spacing2.sm },
  statTile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconWrapDanger: { backgroundColor: 'rgba(255, 180, 171, 0.15)' },
  statValue: { ...typography2.metricMono, fontSize: 18 },
  statUnit: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },

  sectionTitle: { ...typography2.headlineMd, fontSize: 16 },
  exerciseList: { gap: spacing2.sm },
  exerciseCard: { gap: spacing2.sm },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  exerciseIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius2.md,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfo: { flex: 1, gap: 4 },
  exerciseName: { ...typography2.bodyMd, fontSize: 16, fontWeight: '700' },
  exerciseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  exerciseSets: { ...typography2.metricMono, fontSize: 13, color: colors2.secondary },
  exerciseMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors2.outlineVariant },
  exerciseRestRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  exerciseRest: { ...typography2.labelCaps, textTransform: 'none' },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing2.xs,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: radius2.sm,
    padding: spacing2.sm,
  },
  noteText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant, flex: 1 },

  logSection: {
    gap: spacing2.xs,
    backgroundColor: colors2.surfaceContainerHigh,
    borderRadius: radius2.sm,
    padding: spacing2.sm,
  },
  lastPerformanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  lastPerformanceText: { ...typography2.labelCaps, textTransform: 'none', fontSize: 11, color: colors2.onSurfaceVariant },
  logHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  logHeaderCell: { ...typography2.labelCaps, textTransform: 'none', fontSize: 11, color: colors2.onSurfaceVariant },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  logSerieCell: { width: 28 },
  logSerieText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  logInputCell: { flex: 1 },
  logInput: {
    backgroundColor: colors2.surfaceContainer,
    borderRadius: radius2.sm,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    paddingHorizontal: spacing2.sm,
    paddingVertical: spacing2.xs + 2,
    color: colors2.onSurface,
    fontSize: 14,
    textAlign: 'center',
  },
  logCheckCell: { width: 28, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: radius2.pill,
    borderWidth: 1,
    borderColor: 'rgba(149, 142, 160, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: { backgroundColor: colors2.violet, borderColor: colors2.violet },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: spacing2.xs,
  },
  addSetText: { ...typography2.bodyMd, fontSize: 13, color: colors2.primary, fontWeight: '600' },

  videoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.xs,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.sm,
    padding: spacing2.sm,
  },
  videoPlaceholderText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
  video: { width: '100%', height: 200, borderRadius: radius2.sm, backgroundColor: colors2.surfaceContainerHigh },
});

const stylesLight = StyleSheet.create({
  wrapper: { gap: spacing3.md },
  dayHeader: { gap: 2 },
  dayName: { ...typography3.headlineMd, fontSize: 20 },
  focus: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },

  statsRow: { flexDirection: 'row', gap: spacing3.sm },
  statTile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconWrapDanger: { backgroundColor: 'rgba(186, 26, 26, 0.1)' },
  statValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18, color: colors3.onSurface },
  statUnit: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },

  sectionTitle: { ...typography3.headlineMd, fontSize: 16 },
  exerciseList: { gap: spacing3.sm },
  exerciseCard: { gap: spacing3.sm },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  exerciseIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius3.md,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfo: { flex: 1, gap: 4 },
  exerciseName: { ...typography3.bodyMd, fontSize: 16, fontWeight: '700' },
  exerciseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  exerciseSets: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, color: colors3.onSurfaceVariant },
  exerciseMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors3.outlineVariant },
  exerciseRestRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  exerciseRest: { ...typography3.labelSm, textTransform: 'none' },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing3.xs,
    backgroundColor: 'rgba(107, 56, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.2)',
    borderRadius: radius3.sm,
    padding: spacing3.sm,
  },
  noteText: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant, flex: 1 },

  logSection: {
    gap: spacing3.xs,
    backgroundColor: colors3.surfaceContainerHigh,
    borderRadius: radius3.sm,
    padding: spacing3.sm,
  },
  lastPerformanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  lastPerformanceText: { ...typography3.labelSm, textTransform: 'none', fontSize: 11, color: colors3.onSurfaceVariant },
  logHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  logHeaderCell: { ...typography3.labelSm, textTransform: 'none', fontSize: 11, color: colors3.onSurfaceVariant },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  logSerieCell: { width: 28 },
  logSerieText: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  logInputCell: { flex: 1 },
  logInput: {
    backgroundColor: colors3.surfaceContainer,
    borderRadius: radius3.sm,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    paddingHorizontal: spacing3.sm,
    paddingVertical: spacing3.xs + 2,
    color: colors3.onSurface,
    fontSize: 14,
    textAlign: 'center',
  },
  logCheckCell: { width: 28, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: spacing3.xs,
  },
  addSetText: { ...typography3.bodyMd, fontSize: 13, color: colors3.primary, fontWeight: '600' },

  videoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.xs,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.sm,
    padding: spacing3.sm,
  },
  videoPlaceholderText: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  video: { width: '100%', height: 200, borderRadius: radius3.sm, backgroundColor: colors3.surfaceContainerHigh },
});
