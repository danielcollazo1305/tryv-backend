import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { AiWorkoutSection } from '@/components/AiWorkoutSection';
import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ObscuredCard } from '@/components/ObscuredCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TrainerWorkoutSection } from '@/components/TrainerWorkoutSection';
import { WorkoutAccessGate } from '@/components/WorkoutAccessGate';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { UserBadges, getUserBadges } from '@/services/user';
import { WorkoutPlan, listWorkoutPlans } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Gate de acesso a Treino (reformulacao) — dois acessos INDEPENDENTES:
 * - IA: exige Pro (badges.is_pro), confirmado no backend
 *   (workout_plans.py: POST /workout-plans/generate usa
 *   require_pro_subscription). Nao depende de ter Personal Trainer.
 * - Personal Trainer: exige assinatura ativa do tipo trainer_addon com um
 *   profissional professional_type='personal_trainer' — ja exposto via
 *   GET /users/{id}/badges.teams (mesmo endpoint usado em Perfil/Feed pro
 *   selo "Team [Nome]"), sem precisar de endpoint novo.
 *
 * 4 casos (A/B/C/D) — ver WorkoutAccessGate, TrainerWorkoutSection,
 * AiWorkoutSection.
 */
export default function WorkoutScreen() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [plansData, badgesData] = await Promise.all([listWorkoutPlans(), getUserBadges(user.id)]);
      setPlans(plansData);
      setBadges(badgesData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu treino.'));
      // Falha ao checar badges/assinatura = trata como sem acesso (mais
      // restritivo por padrao) em vez de liberar a tela por engano.
      setBadges(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Recarrega toda vez que a aba ganha foco (ex: ao voltar de "Gerar treino")
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  if (loading) {
    return (
      <ScreenBackground2 style={styles.centeredFlex}>
        <ActivityIndicator size="large" color={colors2.violet} />
      </ScreenBackground2>
    );
  }

  const isPro = badges?.is_pro ?? false;
  const personalTrainerTeam = badges?.teams.find((team) => team.professional_type === 'personal_trainer') ?? null;
  const hasPersonalTrainer = !!personalTrainerTeam;

  // O plano mais recente de cada origem e tratado como o "ativo" atual —
  // mesmo criterio que ja existia (plans[0]), so agora dividido por origem.
  const aiPlan = plans.find((plan) => !plan.trainer_id) ?? null;
  const trainerPlan = plans.find((plan) => !!plan.trainer_id) ?? null;

  // Caso A — sem Pro e sem Personal Trainer: gate cobrindo a tela inteira.
  if (!isPro && !hasPersonalTrainer) {
    return (
      <ScreenBackground2>
        <WorkoutAccessGate>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="barbell" size={32} color={colors2.violet} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum plano de treino ainda</Text>
          </View>
        </WorkoutAccessGate>
      </ScreenBackground2>
    );
  }

  return (
    <ScreenBackground2>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Treino</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Casos B/D — secao do Personal Trainer, so quando ha assinatura ativa. */}
        {hasPersonalTrainer && (
          <TrainerWorkoutSection trainerName={personalTrainerTeam!.trainer_name} plan={trainerPlan} />
        )}

        {/* Caso C/D — Pro de verdade: secao de IA completa. */}
        {isPro && <AiWorkoutSection plan={aiPlan} />}

        {/*
          Caso B — tem Personal Trainer mas nao e Pro: a secao de IA nao
          fica totalmente ausente (decisao deliberada, ver comentario
          abaixo) — aparece ofuscada com CTA, pra deixar claro que e uma
          funcionalidade bloqueada (nao algo quebrado/faltando), conforme
          pedido explicitamente pra nao deixar essa ambiguidade.
        */}
        {!isPro && hasPersonalTrainer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Treino gerado por IA</Text>
            <ObscuredCard>
              <LiquiglassCard style={styles.lockedPreview}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="barbell" size={24} color={colors2.violet} />
                </View>
                <Text style={styles.lockedPreviewText}>Gere um plano semanal personalizado com IA</Text>
              </LiquiglassCard>
            </ObscuredCard>
            <Button2
              label="Assinar Tryv Pro para desbloquear"
              variant="secondary"
              onPress={() => router.push('/subscriptions/pro')}
            />
          </View>
        )}
      </ScrollView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centeredFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.xl, gap: spacing2.lg },
  title: { ...typography2.headlineLgMobile, fontSize: 26 },
  error: { color: colors2.danger, textAlign: 'center' },

  section: { gap: spacing2.md },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },
  lockedPreview: { alignItems: 'center', gap: spacing2.sm },
  lockedPreviewText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing2.xl,
    gap: spacing2.sm,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius2.lg,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing2.md,
  },
  emptyTitle: { ...typography2.headlineMd, textAlign: 'center' },
});
