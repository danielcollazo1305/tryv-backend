import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { WorkoutPlanView } from '@/components/WorkoutPlanView';
import { WorkoutPlan } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

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
 */
export function TrainerWorkoutSection({ trainerName, plan }: { trainerName: string; plan: WorkoutPlan | null }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Seu treino com {trainerName}</Text>
      {plan?.plan_data ? (
        <WorkoutPlanView planData={plan.plan_data} />
      ) : (
        <LiquiglassCard style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="clipboard-outline" size={24} color={colors2.violet} />
          </View>
          <Text style={styles.emptyText}>
            Seu Personal Trainer ainda nao montou um plano de treino para voce.
          </Text>
        </LiquiglassCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing2.md },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },
  emptyCard: { alignItems: 'center', gap: spacing2.sm },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius2.lg,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
});
