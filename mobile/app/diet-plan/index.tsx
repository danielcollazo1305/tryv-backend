import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { DietPlanMealCard } from '@/components/DietPlanMealCard';
import { getApiErrorMessage } from '@/services/api';
import { DietPlan, listMyDietPlans } from '@/services/dietPlans';
import { colors, spacing, typography } from '@/constants/theme';

export default function DietPlanScreen() {
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const plans = await listMyDietPlans();
      // Mais recente primeiro (updated_at desc) — o [0] e o plano ativo atual.
      setPlan(plans[0] ?? null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu plano alimentar.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPlan();
    }, [fetchPlan])
  );

  const meals = plan?.plan_data?.meals ?? [];
  const hasTargets =
    !!plan &&
    (plan.daily_calorie_target != null ||
      plan.daily_protein_target != null ||
      plan.daily_carbs_target != null ||
      plan.daily_fat_target != null);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Plano alimentar</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && !plan && !error && (
          <View style={styles.centered}>
            <Ionicons name="nutrition-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>Voce ainda nao tem um plano alimentar ativo.</Text>
          </View>
        )}

        {!loading && plan && (
          <>
            {hasTargets && (
              <Card style={styles.targetsCard}>
                <Text style={styles.targetsTitle}>Metas diarias sugeridas</Text>
                <View style={styles.targetsRow}>
                  {plan.daily_calorie_target != null && (
                    <View style={styles.targetStat}>
                      <Text style={styles.targetNumber}>{Math.round(plan.daily_calorie_target)}</Text>
                      <Text style={styles.targetLabel}>kcal</Text>
                    </View>
                  )}
                  {plan.daily_protein_target != null && (
                    <View style={styles.targetStat}>
                      <Text style={styles.targetNumber}>{Math.round(plan.daily_protein_target)}</Text>
                      <Text style={styles.targetLabel}>proteina (g)</Text>
                    </View>
                  )}
                  {plan.daily_carbs_target != null && (
                    <View style={styles.targetStat}>
                      <Text style={styles.targetNumber}>{Math.round(plan.daily_carbs_target)}</Text>
                      <Text style={styles.targetLabel}>carbo (g)</Text>
                    </View>
                  )}
                  {plan.daily_fat_target != null && (
                    <View style={styles.targetStat}>
                      <Text style={styles.targetNumber}>{Math.round(plan.daily_fat_target)}</Text>
                      <Text style={styles.targetLabel}>gordura (g)</Text>
                    </View>
                  )}
                </View>
              </Card>
            )}

            {!!plan.notes && (
              <Card style={styles.notesCard}>
                <Text style={styles.notesText}>{plan.notes}</Text>
              </Card>
            )}

            {meals.length === 0 ? (
              <Text style={styles.emptyText}>Seu nutricionista ainda nao adicionou refeicoes a esse plano.</Text>
            ) : (
              meals.map((meal, index) => <DietPlanMealCard key={`${meal.name}-${index}`} meal={meal} />)
            )}
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
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  error: { color: colors.danger, textAlign: 'center' },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },

  targetsCard: { gap: spacing.sm },
  targetsTitle: { ...typography.h3 },
  targetsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  targetStat: { alignItems: 'flex-start', flex: 1 },
  targetNumber: { ...typography.statNumber, fontSize: 22 },
  targetLabel: { ...typography.statLabel, marginTop: spacing.xs },

  notesCard: { gap: spacing.xs },
  notesText: { ...typography.bodySecondary },
});
