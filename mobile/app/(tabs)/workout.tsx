import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { AiWorkoutSection } from '@/components/AiWorkoutSection';
import { GlassCard } from '@/components/GlassCard';
import { ProGate } from '@/components/ProGate';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TrainerWorkoutSection } from '@/components/TrainerWorkoutSection';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { UserBadges, getUserBadges } from '@/services/user';
import { WorkoutPlan, listWorkoutPlans } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Botao "+" da aba Treino: abre a tela "Treinar" (/treinar, menu retro de 2 niveis). Ela substitui o antigo
 * modal "Iniciar atividade"; Corrida/Caminhada/Bike, Halter e Luta viraram modalidades de la, e a selecao
 * antiga (natacao, HIIT, outro) continua em "Outras atividades" (/activity/new sem parametros).
 */
function StartActivityFab() {
  return (
    <Pressable
      style={styles.fab}
      onPress={() => router.push('/treinar')}
      accessibilityRole="button"
      accessibilityLabel="Iniciar treino"
    >
      <Ionicons name="add" size={28} color={colors3.onPrimary} />
    </Pressable>
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
 * 4 casos (A/B/C/D) — ver ProGate, TrainerWorkoutSection,
 * AiWorkoutSection.
 *
 * Migrado pro tema claro "prism-glass" — so troca de tokens/componentes
 * visuais (ScreenBackground2 -> 3, Button2 -> Button3, LiquiglassCard ->
 * GlassCard, colors2 -> colors3), nenhuma logica de acesso/geracao/
 * navegacao foi alterada.
 */
export default function WorkoutScreen() {
  const { user, isPro } = useAuth();
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
      setError(getApiErrorMessage(err, 'Não foi possível carregar seu treino.'));
      // badges aqui so alimenta `teams` (Personal Trainer); o Pro vem do
      // AuthContext. Falha = sem dado de Personal Trainer (badges null), nunca
      // "nao e Pro" -- isPro nao depende desta busca.
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
      <ScreenBackground3 style={styles.centeredFlex}>
        <ActivityIndicator size="large" color={colors3.primary} />
      </ScreenBackground3>
    );
  }

  const personalTrainerTeam = badges?.teams.find((team) => team.professional_type === 'personal_trainer') ?? null;
  const hasPersonalTrainer = !!personalTrainerTeam;

  // O plano mais recente de cada origem e tratado como o "ativo" atual —
  // mesmo criterio que ja existia (plans[0]), so agora dividido por origem.
  const aiPlan = plans.find((plan) => !plan.trainer_id) ?? null;
  const trainerPlan = plans.find((plan) => !!plan.trainer_id) ?? null;

  // Caso A — sem Pro e sem Personal Trainer: gate cobrindo a tela inteira.
  // So bloqueia com isPro === false (null = ainda carregando/falhou, nao e
  // "sem Pro") e com `badges` carregado (sem ele nao sabemos se ha Personal
  // Trainer; nesse caso cai na tela normal, que ja mostra o erro de carga).
  // O FAB de iniciar atividade continua disponivel mesmo aqui — rastrear uma
  // corrida/pedalada/caminhada com GPS nao depende de Pro nem de Personal
  // Trainer, e um recurso gratuito independente do plano estruturado.
  if (isPro === false && badges !== null && !hasPersonalTrainer) {
    return (
      <ScreenBackground3>
        {/*
          Entrada pro Perfil tambem aqui no Caso A — faltava antes desta
          tarefa (so o retorno principal abaixo tinha avatar), o que
          deixaria justamente quem mais se beneficia do badge de upgrade
          (usuario free, sem Personal Trainer) sem ver-lo nesta aba.
        */}
        <View style={styles.gateHeader}>
          <Pressable onPress={() => router.push('/activity')} hitSlop={12} accessibilityLabel="Histórico de atividades">
            <Ionicons name="time-outline" size={22} color={colors3.onSurfaceVariant} />
          </Pressable>
          <ProfileAvatarButton isPro={isPro ?? undefined} size={36} />
        </View>
        <ProGate
          variant="fullscreen"
          title="Acesso a treinos"
          subtitle="Assine o Tryv Fit Pro para treinos gerados por IA, personalizados pro seu objetivo, nível e equipamento disponível."
        >
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="barbell" size={32} color={colors3.primary} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum plano de treino ainda</Text>
          </View>
        </ProGate>
        <StartActivityFab />
      </ScreenBackground3>
    );
  }

  return (
    <ScreenBackground3>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.headerWrap}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <View style={styles.header}>
            <Text style={styles.title}>Treino</Text>
            <View style={styles.headerActions}>
              {/* Unico ponto de entrada dedicado pra lista de atividades
                  na aba Treino -- antes so era alcancavel via "Veja mais do
                  seu progresso" (ActivityProgressCard, Home), que continua
                  existindo tambem (nao concorrente, so mais um caminho). */}
              <Pressable onPress={() => router.push('/activity')} hitSlop={12} accessibilityLabel="Histórico de atividades">
                <Ionicons name="time-outline" size={22} color={colors3.onSurfaceVariant} />
              </Pressable>
              {/* Entrada pro Perfil (Perfil saiu da tab bar, ver (tabs)/_layout.tsx). */}
              <ProfileAvatarButton isPro={isPro ?? undefined} size={36} />
            </View>
          </View>
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Casos B/D — secao do Personal Trainer, so quando ha assinatura ativa. */}
        {hasPersonalTrainer && (
          <TrainerWorkoutSection trainerName={personalTrainerTeam!.trainer_name} plan={trainerPlan} />
        )}

        {/* Caso C/D — Pro de verdade: secao de IA completa. */}
        {isPro === true && <AiWorkoutSection plan={aiPlan} />}

        {/*
          Caso B — tem Personal Trainer mas nao e Pro: a secao de IA nao
          fica totalmente ausente (decisao deliberada, ver comentario
          abaixo) — aparece ofuscada com CTA, pra deixar claro que e uma
          funcionalidade bloqueada (nao algo quebrado/faltando), conforme
          pedido explicitamente pra nao deixar essa ambiguidade.
        */}
        {isPro === false && hasPersonalTrainer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Treino gerado por IA</Text>
            <ProGate variant="card" borderRadius={radius3.xl}>
              <GlassCard variant="glass" style={styles.lockedPreview}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="barbell" size={24} color={colors3.primary} />
                </View>
                <Text style={styles.lockedPreviewText}>Gere um plano semanal personalizado com IA</Text>
              </GlassCard>
            </ProGate>
          </View>
        )}
      </ScrollView>
      <StartActivityFab />
    </ScreenBackground3>
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
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing3.md,
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
  },
  content: { padding: spacing3.containerMargin, paddingTop: spacing3.xl, paddingBottom: spacing3.xl, gap: spacing3.lg },
  headerWrap: { gap: spacing3.xs },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },
  error: { color: colors3.error, textAlign: 'center' },

  section: { gap: spacing3.md },
  sectionTitle: { ...typography3.headlineMd, fontSize: 18 },
  lockedPreview: { alignItems: 'center', gap: spacing3.sm },
  lockedPreviewText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing3.xl,
    gap: spacing3.sm,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius3.lg,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing3.md,
  },
  emptyTitle: { ...typography3.headlineMd, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: spacing3.lg,
    bottom: spacing3.lg,
    width: 56,
    height: 56,
    borderRadius: radius3.pill,
    backgroundColor: colors3.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors3.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
