import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { MuscleDiagram } from '@/components/MuscleDiagram';
import { getDayMuscleGroups, getExerciseInfo } from '@/constants/exerciseLibrary';
import { WorkoutDay } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Video de execucao por exercicio (item 2) — so estrutura/estado vazio
 * por enquanto, nenhum video existe ainda (confirmado com o usuario):
 * - Plano de IA: video viria de uma biblioteca generica do proprio app
 *   (ExerciseLibraryEntry.videoUrl, ver constants/exerciseLibrary.ts).
 * - Plano de Personal Trainer: video seria gravado/enviado pelo proprio
 *   profissional — DEPENDENCIA NAO RESOLVIDA, documentada aqui de
 *   proposito pra nao ficar esquecida: nao existe hoje nenhum endpoint
 *   pro trainer sequer atribuir um plano a um aluno (achado da tarefa
 *   anterior), entao "trainer sobe video pro exercicio dele" e uma
 *   camada em cima de algo que nem existe ainda. Ate isso ser construido,
 *   planos de trainer caem no mesmo estado vazio abaixo.
 *
 * Quando video_url existir de verdade, essa funcao precisa de um player
 * de video (nenhuma lib de video esta instalada no projeto hoje, ex.
 * expo-video) — nao instalei uma lib nova so pra um caminho que nunca
 * roda com o dado atual (sempre undefined).
 */
function ExerciseVideoBlock({ videoUrl }: { videoUrl?: string }) {
  if (videoUrl) {
    // Nunca roda hoje (nenhum videoUrl real existe) — placeholder
    // estrutural pra quando houver um player de video integrado.
    return null;
  }
  return (
    <View style={styles.videoPlaceholder}>
      <Ionicons name="play-circle-outline" size={20} color={colors2.onSurfaceVariant} />
      <Text style={styles.videoPlaceholderText}>Video de execucao em breve</Text>
    </View>
  );
}

export function WorkoutDayCard({ day }: { day: WorkoutDay }) {
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
            <ExerciseVideoBlock videoUrl={getExerciseInfo(exercise.name)?.videoUrl} />
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
});
