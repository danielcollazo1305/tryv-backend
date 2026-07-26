import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@/components/Button';
import { WorkoutDayCard } from '@/components/WorkoutDayCard';
import { getApiErrorMessage } from '@/services/api';
import { WorkoutPlan, listWorkoutPlans } from '@/services/workouts';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function WorkoutScreen() {
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWorkoutPlans();
      setPlans(data);
      setSelectedDayIndex(0);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu plano de treino.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Recarrega toda vez que a aba ganha foco (ex: ao voltar de "Gerar treino")
  useFocusEffect(
    useCallback(() => {
      fetchPlans();
    }, [fetchPlans])
  );

  if (loading) {
    return (
      <View style={styles.centeredFlex}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // O plano mais recente e tratado como o "ativo" atual — o backend nao tem
  // conceito de arquivar planos antigos, entao gerar um novo so muda qual
  // e o primeiro da lista (ordenada por created_at desc).
  const currentPlan = plans[0] ?? null;

  if (!currentPlan || !currentPlan.plan_data) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="barbell" size={32} color={colors.accent} />
        </View>
        <Text style={styles.emptyTitle}>Nenhum plano de treino ainda</Text>
        <Text style={styles.emptyText}>
          Gere um plano semanal personalizado com IA, de acordo com seu objetivo, nivel e equipamento disponivel.
        </Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button label="Gerar treino com IA" onPress={() => router.push('/workout-plan/generate')} />
      </View>
    );
  }

  const days = currentPlan.plan_data.days;
  const selectedDay = days[selectedDayIndex] ?? days[0];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Treino</Text>
      <Text style={styles.summary}>{currentPlan.plan_data.summary}</Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayPills}>
        {days.map((day, index) => {
          const selected = index === selectedDayIndex;
          return (
            <Pressable
              key={`${day.day}-${index}`}
              onPress={() => setSelectedDayIndex(index)}
              style={[styles.dayPill, selected && styles.dayPillSelected]}
            >
              <Text style={[styles.dayPillText, selected && styles.dayPillTextSelected]}>{day.day}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedDay && <WorkoutDayCard day={selectedDay} />}

      <Button label="Gerar novo plano" variant="secondary" onPress={() => router.push('/workout-plan/generate')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centeredFlex: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...typography.h1 },
  summary: { ...typography.bodySecondary, marginTop: -spacing.sm },
  error: { color: colors.danger, textAlign: 'center' },
  dayPills: { gap: spacing.sm, paddingVertical: spacing.xs },
  dayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayPillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayPillText: { ...typography.bodySecondary, color: colors.text },
  dayPillTextSelected: { color: colors.white, fontWeight: '700' },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h2, textAlign: 'center' },
  emptyText: { ...typography.bodySecondary, textAlign: 'center', marginBottom: spacing.lg },
});
