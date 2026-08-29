import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button2 } from '@/components/Button2';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { SetEntry, SetLogSection } from '@/components/WorkoutDayCard';
import { FreeSessionExerciseDraft, useWorkoutSessionDraft } from '@/context/WorkoutSessionDraftContext';
import { ExerciseLibraryEntry } from '@/constants/exerciseLibrary';
import { logFreeWorkoutSession } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/** Re-exportado por conveniencia (o formato "de verdade" mora em WorkoutSessionDraftContext.tsx — ver comentario la sobre por que o Context nao importa de um componente de tela). */
export type FreeSessionExercise = FreeSessionExerciseDraft;

const DEFAULT_SET_COUNT = 3;

function buildDefaultSets(): SetEntry[] {
  return Array.from({ length: DEFAULT_SET_COUNT }, () => ({ weightKg: '', reps: '', completed: false }));
}

interface FreeWorkoutLogViewProps {
  /** Chamado apos salvar a sessao com sucesso (ex: navegar de volta). */
  onDone: () => void;
}

/**
 * Registro de treino "livre" — sem plano nenhum associado. Ponto de
 * entrada universal do card "Começar treino" (TodayWorkoutCard.tsx) quando
 * nao ha plano de IA ativo pra hoje: a pessoa escolhe exercicios
 * manualmente (ExercisePickerModal, biblioteca local em
 * constants/exerciseLibrary.ts) e registra peso/reps livremente,
 * reaproveitando o mesmo SetLogSection ja usado no registro de plano
 * (WorkoutDayCard.tsx) — mesma UI de series, sem duplicar layout.
 */
export function FreeWorkoutLogView({ onDone }: FreeWorkoutLogViewProps) {
  // Le/escreve pelo WorkoutSessionDraftContext (nao um useState local) —
  // sobrevive a navegar pra outra aba/tela e voltar antes de concluir o
  // treino (ex: usuario abre a Home no meio do registro pra conferir algo,
  // depois volta e continua de onde parou). Se ja houver um draft mode:
  // 'free' em andamento (retomando apos navegar embora sem concluir),
  // `exercises` comeca com ele em vez de vazio.
  const { draft, setDraft } = useWorkoutSessionDraft();
  const exercises = draft?.mode === 'free' ? draft.exercises : [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateExercises = (updater: (prev: FreeSessionExercise[]) => FreeSessionExercise[]) => {
    setDraft((prevDraft) => {
      const prevExercises = prevDraft?.mode === 'free' ? prevDraft.exercises : [];
      return { mode: 'free', exercises: updater(prevExercises) };
    });
  };

  const handleAddExercise = (entry: ExerciseLibraryEntry) => {
    updateExercises((prev) => {
      if (prev.some((ex) => ex.name === entry.name)) return prev;
      return [...prev, { name: entry.name, sets: buildDefaultSets() }];
    });
  };

  const handleRemoveExercise = (name: string) => {
    updateExercises((prev) => prev.filter((ex) => ex.name !== name));
  };

  const handleSetsChange = (name: string, sets: SetEntry[]) => {
    updateExercises((prev) => prev.map((ex) => (ex.name === name ? { ...ex, sets } : ex)));
  };

  const handleComplete = async () => {
    if (exercises.length === 0) {
      Alert.alert('Nenhum exercício adicionado', 'Adicione ao menos 1 exercício antes de concluir o treino.');
      return;
    }

    setSaving(true);
    try {
      await logFreeWorkoutSession({
        exercises: exercises.map((exercise) => ({
          name: exercise.name,
          planned_sets: exercise.sets.length,
          planned_reps: '',
          // So salva series de fato preenchidas — mesmo criterio ja usado
          // pro registro de plano em WorkoutPlanView.tsx.
          sets: exercise.sets
            .filter((set) => set.completed || set.weightKg.trim() || set.reps.trim())
            .map((set) => ({
              weight_kg: set.weightKg.trim() ? Number(set.weightKg.replace(',', '.')) : null,
              reps: set.reps.trim() ? Number(set.reps) : null,
              completed: set.completed,
            })),
        })),
      });
      setDraft(null);
      onDone();
    } catch {
      Alert.alert('Não foi possível salvar o treino', 'Tente novamente mais tarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.summary}>
          Escolha os exercícios que você fez e registre peso/reps de cada série — sem depender de nenhum plano.
        </Text>

        {exercises.map((exercise) => (
          <LiquiglassCard key={exercise.name} style={styles.exerciseCard} padding={spacing2.md}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              <Pressable hitSlop={8} onPress={() => handleRemoveExercise(exercise.name)}>
                <Ionicons name="trash-outline" size={18} color={colors2.onSurfaceVariant} />
              </Pressable>
            </View>
            <SetLogSection
              plannedSets={exercise.sets.length}
              sets={exercise.sets}
              onChange={(sets) => handleSetsChange(exercise.name, sets)}
              exerciseName={exercise.name}
            />
          </LiquiglassCard>
        ))}

        <Pressable style={styles.addExerciseButton} onPress={() => setPickerOpen(true)}>
          <Ionicons name="add-circle-outline" size={20} color={colors2.primary} />
          <Text style={styles.addExerciseText}>Adicionar exercício</Text>
        </Pressable>
      </ScrollView>

      <Button2 label="Concluir treino" onPress={handleComplete} loading={saving} />

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddExercise}
        addedNames={exercises.map((ex) => ex.name)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing2.md },
  scrollContent: { gap: spacing2.md, paddingBottom: spacing2.md },
  summary: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  exerciseCard: { gap: spacing2.sm },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseName: { ...typography2.bodyMd, fontSize: 16, fontWeight: '700' },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.xs,
    paddingVertical: spacing2.md,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors2.outlineVariant,
  },
  addExerciseText: { ...typography2.bodyMd, color: colors2.primary, fontWeight: '600' },
});
