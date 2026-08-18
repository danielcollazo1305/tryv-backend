import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { WorkoutPlanView } from '@/components/WorkoutPlanView';
import { WorkoutPlan, daysUntilWorkoutPlanExpiration, isWorkoutPlanExpired } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Casos C/D do gate de acesso — fluxo de treino gerado por IA
 * (WorkoutPlan.trainer_id == null), so pra quem e Pro. Titulo sempre
 * visivel (mesmo sozinho no Caso C) — decisao deliberada de manter
 * consistencia visual com o Caso D em vez de criar um caso especial so
 * pra quando e a unica secao da tela.
 *
 * Validade de 8 semanas: um plano expirado NAO desaparece — continua
 * renderizado normalmente abaixo (a pessoa pode querer ver o que
 * treinava), so ganha um banner "Plano expirado" + CTA "Gerar novo
 * treino" acima dele. O botao "Gerar novo plano" que ja existia dentro de
 * WorkoutPlanView (onGenerateNew) fica desligado nesse caso, pra nao
 * duplicar a mesma acao em 2 lugares na tela.
 */
export function AiWorkoutSection({ plan }: { plan: WorkoutPlan | null }) {
  const expired = plan ? isWorkoutPlanExpired(plan) : false;
  const daysLeft = plan ? daysUntilWorkoutPlanExpiration(plan) : null;
  const showExpiringSoonWarning = !expired && daysLeft != null && daysLeft <= 7;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Treino gerado por IA</Text>

      {expired && (
        <LiquiglassCard style={styles.expiredCard}>
          <View style={styles.expiredHeader}>
            <Ionicons name="time-outline" size={16} color={colors2.danger} />
            <Text style={styles.expiredBadge}>Plano expirado</Text>
          </View>
          <Text style={styles.expiredText}>
            Esse plano passou da validade de 8 semanas. Voce ainda pode ver o que treinava, mas pra continuar
            evoluindo, gere um plano novo.
          </Text>
          <Button2 label="Gerar novo treino" onPress={() => router.push('/workout-plan/generate')} />
        </LiquiglassCard>
      )}

      {showExpiringSoonWarning && (
        <View style={styles.expiringSoonRow}>
          <Ionicons name="alert-circle-outline" size={14} color={colors2.onSurfaceVariant} />
          <Text style={styles.expiringSoonText}>
            Seu plano expira em {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} — considere gerar um novo em breve.
          </Text>
        </View>
      )}

      {plan?.plan_data ? (
        <WorkoutPlanView
          planData={plan.plan_data}
          planId={plan.id}
          onGenerateNew={expired ? undefined : () => router.push('/workout-plan/generate')}
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

  expiredCard: { gap: spacing2.sm, borderWidth: 1, borderColor: 'rgba(255, 180, 171, 0.3)' },
  expiredHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  expiredBadge: { ...typography2.labelCaps, color: colors2.danger },
  expiredText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },

  expiringSoonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  expiringSoonText: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant, flex: 1 },
});
