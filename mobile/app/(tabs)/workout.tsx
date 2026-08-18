import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { AiWorkoutSection } from '@/components/AiWorkoutSection';
import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ObscuredCard } from '@/components/ObscuredCard';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TrainerWorkoutSection } from '@/components/TrainerWorkoutSection';
import { WorkoutAccessGate } from '@/components/WorkoutAccessGate';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { ACTIVITY_TYPE_LABELS, GpsActivityType } from '@/services/activities';
import { UserBadges, getUserBadges } from '@/services/user';
import { WorkoutPlan, listWorkoutPlans } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const GPS_FAB_OPTIONS: { type: GpsActivityType; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { type: 'run', icon: 'walk' },
  { type: 'bike', icon: 'bicycle' },
  { type: 'walk', icon: 'footsteps' },
];

/**
 * Ponto de entrada unico "Iniciar atividade" (item 3 da task
 * "atividade-entrada-unica") — antes so existia um caminho pra
 * activity/new.tsx (FAB dentro de Atividades, acessada via card "Km
 * rodados" da Home; confirmado na investigacao). Esse FAB fica na aba
 * Treino porque e o lugar mais natural de "vou treinar agora", cobrindo
 * tanto plano estruturado quanto atividade com GPS — o caminho antigo
 * (Home -> Atividades -> FAB) continua existindo tambem, sem conflito
 * (so mais uma porta de entrada pro mesmo activity/new.tsx).
 */
function StartActivityFab() {
  const [open, setOpen] = useState(false);

  const handleSelectGps = (type: GpsActivityType) => {
    setOpen(false);
    router.push({ pathname: '/activity/new', params: { type } });
  };

  return (
    <>
      <Pressable style={styles.fab} onPress={() => setOpen(true)}>
        <Ionicons name="add" size={28} color={colors2.white} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Iniciar atividade</Text>

            {/*
              "Treino do dia" nao navega pra lugar nenhum — o plano
              estruturado ja esta bem abaixo, na mesma aba Treino (secoes
              de IA/Personal Trainer). So fecha o seletor.
            */}
            <Pressable style={styles.modalOption} onPress={() => setOpen(false)}>
              <View style={styles.modalOptionIconWrap}>
                <Ionicons name="barbell" size={20} color={colors2.primary} />
              </View>
              <View style={styles.modalOptionTexts}>
                <Text style={styles.modalOptionTitle}>Treino do dia</Text>
                <Text style={styles.modalOptionSubtitle}>Seu plano estruturado, logo abaixo</Text>
              </View>
            </Pressable>

            {GPS_FAB_OPTIONS.map((option) => (
              <Pressable key={option.type} style={styles.modalOption} onPress={() => handleSelectGps(option.type)}>
                <View style={styles.modalOptionIconWrap}>
                  <Ionicons name={option.icon} size={20} color={colors2.primary} />
                </View>
                <View style={styles.modalOptionTexts}>
                  <Text style={styles.modalOptionTitle}>{ACTIVITY_TYPE_LABELS[option.type]}</Text>
                  <Text style={styles.modalOptionSubtitle}>Rastreamento por GPS ao vivo</Text>
                </View>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

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
  // O FAB de iniciar atividade continua disponivel mesmo aqui — rastrear uma
  // corrida/pedalada/caminhada com GPS nao depende de Pro nem de Personal
  // Trainer, e um recurso gratuito independente do plano estruturado.
  if (!isPro && !hasPersonalTrainer) {
    return (
      <ScreenBackground2>
        {/*
          Entrada pro Perfil tambem aqui no Caso A — faltava antes desta
          tarefa (so o retorno principal abaixo tinha avatar), o que
          deixaria justamente quem mais se beneficia do badge de upgrade
          (usuario free, sem Personal Trainer) sem ver-lo nesta aba.
        */}
        <View style={styles.gateHeader}>
          <ProfileAvatarButton isPro={isPro} size={36} />
        </View>
        <WorkoutAccessGate>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="barbell" size={32} color={colors2.violet} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum plano de treino ainda</Text>
          </View>
        </WorkoutAccessGate>
        <StartActivityFab />
      </ScreenBackground2>
    );
  }

  return (
    <ScreenBackground2>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.headerWrap}>
          <Text style={styles.logo}>Tryv</Text>
          <View style={styles.header}>
            <Text style={styles.title}>Treino</Text>
            {/* Entrada pro Perfil (Perfil saiu da tab bar, ver (tabs)/_layout.tsx). */}
            <ProfileAvatarButton isPro={isPro} size={36} />
          </View>
        </View>
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
      <StartActivityFab />
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
  gateHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
  },
  content: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.xl, gap: spacing2.lg },
  headerWrap: { gap: spacing2.xs },
  logo: { ...typography2.displayHero, fontSize: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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

  fab: {
    position: 'absolute',
    right: spacing2.lg,
    bottom: spacing2.lg,
    width: 56,
    height: 56,
    borderRadius: radius2.pill,
    backgroundColor: colors2.violet,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors2.surfaceContainer,
    borderTopLeftRadius: radius2.lg,
    borderTopRightRadius: radius2.lg,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    padding: spacing2.lg,
    paddingBottom: spacing2.xl,
    gap: spacing2.sm,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors2.outlineVariant,
    alignSelf: 'center',
    marginBottom: spacing2.xs,
  },
  modalTitle: { ...typography2.headlineMd, fontSize: 18, marginBottom: spacing2.xs },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.md,
    paddingVertical: spacing2.sm,
  },
  modalOptionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius2.md,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionTexts: { flex: 1, gap: 2 },
  modalOptionTitle: { ...typography2.bodyMd, fontWeight: '700' },
  modalOptionSubtitle: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },
});
