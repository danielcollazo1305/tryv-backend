import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { WorkoutPlanView } from '@/components/WorkoutPlanView';
import { WorkoutPlan } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Casos C/D do gate de acesso — fluxo de treino gerado por IA
 * (WorkoutPlan.trainer_id == null), so pra quem e Pro. Titulo sempre
 * visivel (mesmo sozinho no Caso C) — decisao deliberada de manter
 * consistencia visual com o Caso D em vez de criar um caso especial so
 * pra quando e a unica secao da tela.
 */
export function AiWorkoutSection({ plan }: { plan: WorkoutPlan | null }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Treino gerado por IA</Text>
      {plan?.plan_data ? (
        <WorkoutPlanView
          planData={plan.plan_data}
          planId={plan.id}
          onGenerateNew={() => router.push('/workout-plan/generate')}
        />
      ) : (
        <LiquiglassCard style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="barbell" size={24} color={colors2.violet} />
          </View>
          <Text style={styles.emptyTitle}>Nenhum plano de treino ainda</Text>
          <Text style={styles.emptyText}>
            Gere um plano semanal personalizado com IA, de acordo com seu objetivo, nivel e equipamento disponivel.
          </Text>
          <Button2 label="Gerar treino com IA" onPress={() => router.push('/workout-plan/generate')} />
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
  emptyTitle: { ...typography2.headlineMd, fontSize: 16, textAlign: 'center' },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center', marginBottom: spacing2.xs },
});
