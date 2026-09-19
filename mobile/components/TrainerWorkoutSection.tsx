import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from '@/components/GlassCard';
import { WorkoutPlanView } from '@/components/WorkoutPlanView';
import { WorkoutPlan } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Casos B/D do gate de acesso — plano de treino montado pelo Personal
 * Trainer (WorkoutPlan.trainer_id != null).
 *
 * Lacuna real confirmada na investigacao: diferente de diet_plans.py (que
 * ja tem POST /diet-plans/ pro nutricionista atribuir um plano a um aluno
 * especifico), workout_plans.py NAO tem nenhum endpoint equivalente pro
 * personal trainer criar um plano pro aluno — so existe POST
 * /workout-plans/ (o proprio usuario logado criando pra si mesmo,
 * source='ai' por padrao). trainer_id existe no schema/model, mas nao ha
 * como populá-lo hoje. Por isso este componente sempre vai cair no estado
 * vazio na pratica ate essa infraestrutura ser construida (fora do escopo
 * deste pedido, que e so a camada de acesso) — mas o componente ja fica
 * pronto pra quando/se isso existir, sem inventar dado falso nesse meio
 * tempo.
 *
 * Migrado pro tema claro "prism-glass" — exclusivo de (tabs)/workout.tsx.
 * WorkoutPlanView recebe variant="light" (mesma decisao de
 * AiWorkoutSection.tsx).
 */
export function TrainerWorkoutSection({ trainerName, plan }: { trainerName: string; plan: WorkoutPlan | null }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Seu treino com {trainerName}</Text>
      {plan?.plan_data ? (
        <WorkoutPlanView planData={plan.plan_data} planId={plan.id} variant="light" />
      ) : (
        <GlassCard variant="glass" style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="clipboard-outline" size={24} color={colors3.primary} />
          </View>
          <Text style={styles.emptyText}>
            Seu Personal Trainer ainda não montou um plano de treino para você.
          </Text>
        </GlassCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing3.md },
  sectionTitle: { ...typography3.headlineMd, fontSize: 18 },
  emptyCard: { alignItems: 'center', gap: spacing3.sm },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius3.lg,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
