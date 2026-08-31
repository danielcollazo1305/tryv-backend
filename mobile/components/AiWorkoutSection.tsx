import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { WorkoutPlanView } from '@/components/WorkoutPlanView';
import { WorkoutPlan, daysUntilWorkoutPlanExpiration, isWorkoutPlanExpired } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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
 *
 * Migrado pro tema claro "prism-glass" — exclusivo de (tabs)/workout.tsx,
 * confirmado via busca por importadores. WorkoutPlanView recebe
 * variant="light" (ela e compartilhada com workout-plan/generate.tsx,
 * ainda escuro, por isso o default dela continua 'dark').
 */
export function AiWorkoutSection({ plan }: { plan: WorkoutPlan | null }) {
  const expired = plan ? isWorkoutPlanExpired(plan) : false;
  const daysLeft = plan ? daysUntilWorkoutPlanExpiration(plan) : null;
  const showExpiringSoonWarning = !expired && daysLeft != null && daysLeft <= 7;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Treino gerado por IA</Text>

      {expired && (
        <GlassCard variant="glass" style={styles.expiredCard}>
          <View style={styles.expiredHeader}>
            <Ionicons name="time-outline" size={16} color={colors3.error} />
            <Text style={styles.expiredBadge}>Plano expirado</Text>
          </View>
          <Text style={styles.expiredText}>
            Esse plano passou da validade de 8 semanas. Voce ainda pode ver o que treinava, mas pra continuar
            evoluindo, gere um plano novo.
          </Text>
          <Button3 label="Gerar novo treino" onPress={() => router.push('/workout-plan/generate')} />
        </GlassCard>
      )}

      {showExpiringSoonWarning && (
        <View style={styles.expiringSoonRow}>
          <Ionicons name="alert-circle-outline" size={14} color={colors3.onSurfaceVariant} />
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
          variant="light"
        />
      ) : (
        <GlassCard variant="glass" style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="barbell" size={24} color={colors3.primary} />
          </View>
          <Text style={styles.emptyTitle}>Nenhum plano de treino ainda</Text>
          <Text style={styles.emptyText}>
            Gere um plano semanal personalizado com IA, de acordo com seu objetivo, nivel e equipamento disponivel.
          </Text>
          <Button3 label="Gerar treino com IA" onPress={() => router.push('/workout-plan/generate')} />
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
  emptyTitle: { ...typography3.headlineMd, fontSize: 16, textAlign: 'center' },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginBottom: spacing3.xs },

  expiredCard: { gap: spacing3.sm, borderWidth: 1, borderColor: 'rgba(186, 26, 26, 0.3)' },
  expiredHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  expiredBadge: { ...typography3.labelSm, textTransform: 'none', color: colors3.error, fontWeight: '700' },
  expiredText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },

  expiringSoonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  expiringSoonText: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant, flex: 1 },
});
