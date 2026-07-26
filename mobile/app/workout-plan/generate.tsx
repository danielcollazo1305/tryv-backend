import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { TextField } from '@/components/TextField';
import { WorkoutDayCard } from '@/components/WorkoutDayCard';
import { getApiErrorMessage } from '@/services/api';
import { WorkoutPlanData, generateWorkoutPlan, saveWorkoutPlan } from '@/services/workouts';
import { colors, spacing, typography } from '@/constants/theme';

type Stage = 'form' | 'generating' | 'reviewing' | 'saving';

const GOAL_OPTIONS = [
  { value: 'emagrecimento', label: 'Emagrecimento' },
  { value: 'hipertrofia', label: 'Hipertrofia' },
  { value: 'resistencia', label: 'Resistencia' },
];

const LEVEL_OPTIONS = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediario' },
  { value: 'avancado', label: 'Avancado' },
];

const DAYS_OPTIONS = ['2', '3', '4', '5', '6'].map((value) => ({ value, label: `${value}x/semana` }));

export default function GenerateWorkoutScreen() {
  const [stage, setStage] = useState<Stage>('form');
  const [goal, setGoal] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [daysPerWeek, setDaysPerWeek] = useState<string | null>(null);
  const [equipment, setEquipment] = useState('');
  const [notes, setNotes] = useState('');
  const [planData, setPlanData] = useState<WorkoutPlanData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!goal && !!level && !!daysPerWeek && equipment.trim().length > 0;

  const handleGenerate = async () => {
    if (!canSubmit || !goal || !level || !daysPerWeek) {
      setError('Preencha objetivo, nivel, dias por semana e equipamento.');
      return;
    }
    setError(null);
    setStage('generating');
    try {
      const result = await generateWorkoutPlan({
        goal,
        level,
        days_per_week: Number(daysPerWeek),
        equipment: equipment.trim(),
        notes: notes.trim() || undefined,
      });
      setPlanData(result);
      setStage('reviewing');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o plano de treino, tente novamente.'));
      setStage('form');
    }
  };

  const handleConfirm = async () => {
    if (!planData) return;
    setStage('saving');
    setError(null);
    try {
      await saveWorkoutPlan(planData);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o plano.'));
      setStage('reviewing');
    }
  };

  const handleDiscard = () => {
    setStage('form');
    setPlanData(null);
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>{stage === 'form' || stage === 'generating' ? 'Gerar treino' : 'Revisar plano'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        {stage === 'form' && (
          <>
            <ChoiceGroup label="Objetivo" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
            <ChoiceGroup label="Nivel" options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
            <ChoiceGroup label="Dias disponiveis" options={DAYS_OPTIONS} value={daysPerWeek} onChange={setDaysPerWeek} />
            <TextField
              label="Equipamento disponivel"
              placeholder="Ex: academia completa, halteres em casa, so peso do corpo..."
              value={equipment}
              onChangeText={setEquipment}
            />
            <TextField
              label="Observacoes (opcional)"
              placeholder="Ex: dor no joelho, prefiro treinos curtos..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />
            <Button label="Gerar plano" onPress={handleGenerate} disabled={!canSubmit} />
          </>
        )}

        {stage === 'generating' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.generatingText}>Montando seu plano de treino...</Text>
          </View>
        )}

        {(stage === 'reviewing' || stage === 'saving') && planData && (
          <View style={styles.reviewContainer}>
            <Text style={styles.summary}>{planData.summary}</Text>

            {planData.days.map((day, index) => (
              <WorkoutDayCard key={`${day.day}-${index}`} day={day} />
            ))}

            <Button label="Confirmar e salvar" onPress={handleConfirm} loading={stage === 'saving'} />
            <Button
              label="Descartar e gerar outro"
              variant="secondary"
              onPress={handleDiscard}
              disabled={stage === 'saving'}
            />
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
  generatingText: { ...typography.bodySecondary, marginTop: spacing.md },
  reviewContainer: { gap: spacing.md },
  summary: { ...typography.body, color: colors.textSecondary },
});
