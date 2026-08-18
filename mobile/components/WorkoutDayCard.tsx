import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { MuscleDiagram } from '@/components/MuscleDiagram';
import { getDayMuscleGroups, getExerciseInfo } from '@/constants/exerciseLibrary';
import { WorkoutDay } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

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
function ExerciseVideoBlock({ videoUrl }: { videoUrl?: string | null }) {
  if (videoUrl) {
    return <ExerciseVideoPlayer videoUrl={videoUrl} />;
  }
  return (
    <View style={styles.videoPlaceholder}>
      <Ionicons name="play-circle-outline" size={20} color={colors2.onSurfaceVariant} />
      <Text style={styles.videoPlaceholderText}>Video de execucao em breve</Text>
    </View>
  );
}

/**
 * Linhas de peso/reps por serie de um exercicio. So aparece quando o pai
 * passa log/onSetsChange (plano ja salvo, com plan_id pra associar a
 * sessao) — na etapa de revisao do gerador de treino (plano ainda nao
 * salvo), esses props ficam undefined e a secao nao renderiza, ja que nao
 * haveria onde persistir o registro.
 */
function SetLogSection({
  plannedSets,
  sets,
  onChange,
}: {
  plannedSets: number;
  sets: SetEntry[] | undefined;
  onChange: (sets: SetEntry[]) => void;
}) {
  const rows = sets ?? buildDefaultSets(plannedSets);

  const updateRow = (index: number, patch: Partial<SetEntry>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const addSet = () => {
    onChange([...rows, { weightKg: '', reps: '', completed: false }]);
  };

  return (
    <View style={styles.logSection}>
      <View style={styles.logHeaderRow}>
        <Text style={[styles.logHeaderCell, styles.logSerieCell]}>Serie</Text>
        <Text style={[styles.logHeaderCell, styles.logInputCell]}>Peso (kg)</Text>
        <Text style={[styles.logHeaderCell, styles.logInputCell]}>Reps</Text>
        <View style={styles.logCheckCell} />
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.logRow}>
          <Text style={[styles.logSerieText, styles.logSerieCell]}>{index + 1}</Text>
          <TextInput
            style={[styles.logInput, styles.logInputCell]}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors2.onSurfaceVariant}
            value={row.weightKg}
            onChangeText={(text) => updateRow(index, { weightKg: text })}
          />
          <TextInput
            style={[styles.logInput, styles.logInputCell]}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors2.onSurfaceVariant}
            value={row.reps}
            onChangeText={(text) => updateRow(index, { reps: text })}
          />
          <Pressable
            style={styles.logCheckCell}
            hitSlop={8}
            onPress={() => updateRow(index, { completed: !row.completed })}
          >
            <View style={[styles.checkCircle, row.completed && styles.checkCircleDone]}>
              {row.completed && <Ionicons name="checkmark" size={14} color={colors2.white} />}
            </View>
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.addSetButton} onPress={addSet} hitSlop={8}>
        <Ionicons name="add-circle-outline" size={16} color={colors2.primary} />
        <Text style={styles.addSetText}>Adicionar serie</Text>
      </Pressable>
    </View>
  );
}

interface WorkoutDayCardProps {
  day: WorkoutDay;
  /** Registro de peso/reps por indice de exercicio — omitir esconde a secao de registro (ver SetLogSection). */
  log?: Record<number, SetEntry[]>;
  onSetsChange?: (exerciseIndex: number, sets: SetEntry[]) => void;
}

export function WorkoutDayCard({ day, log, onSetsChange }: WorkoutDayCardProps) {
  const hasSummaryStats = day.estimated_duration_minutes != null || day.estimated_calories != null;
  const muscleGroups = getDayMuscleGroups(day.exercises.map((exercise) => exercise.name));

  return (
    <View style={styles.wrapper}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayName}>{day.day}</Text>
        <Text style={styles.focus}>{day.focus}</Text>
      </View>

      <MuscleDiagram muscles={muscleGroups} />

      {hasSummaryStats && (
        <View style={styles.statsRow}>
          {day.estimated_duration_minutes != null && (
            <LiquiglassCard style={styles.statTile} padding={spacing2.md}>
              <View style={styles.statIconWrap}>
                <Ionicons name="time" size={18} color={colors2.violet} />
              </View>
              <Text style={styles.statValue}>
                {day.estimated_duration_minutes}
                <Text style={styles.statUnit}> MIN</Text>
              </Text>
            </LiquiglassCard>
          )}
          {day.estimated_calories != null && (
            <LiquiglassCard style={styles.statTile} padding={spacing2.md}>
              <View style={[styles.statIconWrap, styles.statIconWrapDanger]}>
                <Ionicons name="flame" size={18} color={colors2.danger} />
              </View>
              <Text style={styles.statValue}>
                {day.estimated_calories}
                <Text style={styles.statUnit}> KCAL</Text>
              </Text>
            </LiquiglassCard>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Exercícios</Text>
      <View style={styles.exerciseList}>
        {day.exercises.map((exercise, index) => (
          <LiquiglassCard key={`${exercise.name}-${index}`} style={styles.exerciseCard} padding={spacing2.md}>
            <View style={styles.exerciseRow}>
              <View style={styles.exerciseIconWrap}>
                <Ionicons name="barbell" size={18} color={colors2.primary} />
              </View>
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <View style={styles.exerciseMetaRow}>
                  <Text style={styles.exerciseSets}>
                    {exercise.sets} x {exercise.reps}
                  </Text>
                  <View style={styles.exerciseMetaDot} />
                  <View style={styles.exerciseRestRow}>
                    <Ionicons name="time-outline" size={14} color={colors2.onSurfaceVariant} />
                    <Text style={styles.exerciseRest}>{exercise.rest_seconds}s</Text>
                  </View>
                </View>
              </View>
            </View>
            {!!exercise.notes && (
              <View style={styles.noteBox}>
                <Ionicons name="information-circle" size={16} color={colors2.primary} />
                <Text style={styles.noteText}>{exercise.notes}</Text>
              </View>
            )}
            <ExerciseVideoBlock videoUrl={exercise.video_url ?? getExerciseInfo(exercise.name)?.videoUrl} />
            {!!onSetsChange && (
              <SetLogSection
                plannedSets={exercise.sets}
                sets={log?.[index]}
                onChange={(sets) => onSetsChange(index, sets)}
              />
            )}
          </LiquiglassCard>
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
