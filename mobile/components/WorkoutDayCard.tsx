import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { WorkoutDay } from '@/services/workouts';
import { colors, spacing, typography } from '@/constants/theme';

export function WorkoutDayCard({ day }: { day: WorkoutDay }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.dayName}>{day.day}</Text>
      <Text style={styles.focus}>{day.focus}</Text>

      {day.exercises.map((exercise, index) => (
        <View
          key={`${exercise.name}-${index}`}
          style={[styles.exerciseRow, index === day.exercises.length - 1 && styles.exerciseRowLast]}
        >
          <View style={styles.exerciseHeader}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            <Text style={styles.exerciseSets}>
              {exercise.sets}x {exercise.reps}
            </Text>
          </View>
          <Text style={styles.exerciseMeta}>Descanso: {exercise.rest_seconds}s</Text>
          {!!exercise.notes && <Text style={styles.exerciseNotes}>{exercise.notes}</Text>}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  dayName: { ...typography.h3 },
  focus: { ...typography.bodySecondary, marginBottom: spacing.sm },
  exerciseRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  exerciseRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: { ...typography.body, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  exerciseSets: { ...typography.body, color: colors.accent, fontWeight: '700' },
  exerciseMeta: { ...typography.caption },
  exerciseNotes: { ...typography.bodySecondary, marginTop: 2 },
});
