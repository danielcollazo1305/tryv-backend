import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { GlassCard } from '@/components/GlassCard';
import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { HeatmapDay, HeatmapGrid, todayKey } from '@/components/HeatmapGrid';
import { PostGrid2 } from '@/components/PostGrid2';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { requestHealthKitPermissions } from '@/services/healthkit';
import {
  Challenge,
  buildAutomaticChallengeHeatmapDays,
  buildChallengeHeatmapDays,
  getChallengeProgress,
  listMyActiveChallenges,
  listMyChallengeCheckins,
} from '@/services/challenges';
import { Post, listFollowers, listFollowing, listUserPosts } from '@/services/social';
import { TrainerPublic, getMyTrainerProfile, getTrainer } from '@/services/trainers';
import { UserBadges, getUserBadges } from '@/services/user';
import { getInitials } from '@/utils/text';
import { colors2, colors3, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

interface PersonalChallengeProgress {
  challenge: Challenge;
  trainer: TrainerPublic | null;
  heatmapDays: HeatmapDay[];
}

/**
 * Migrado pro tema claro "prism-glass" (colors3/GlassCard/ScreenBackground3)
 * — segunda migracao visual desta tela (a primeira foi liquiglass/colors2,
 * ver git log). So troca de tokens/componentes visuais, nenhum
 * useFocusEffect ou logica de dados foi alterada.
 *
 * PostGrid2/ProfileBadges2 ainda sao compartilhados com telas que nao
 * migraram (social/[userId].tsx, e settings/badges.tsx no caso do 2o) —
 * ganharam uma prop `variant` (padrao 'dark', 'light' so aqui), mesmo
 * padrao ja usado em EmptyFollowingState/ObscuredCard/TextField2 antes
 * nesta sessao.
 *
 * Cabecalho "Tryv" no topo: mesmo estilo de wordmark ja usado em
 * Home/Feed/Refeicoes/Login (typography3.displayLg, fontSize 36, weight
 * 800, cor primary).
 */
export default function ProfileScreen() {
  const { user } = useAuth();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [resettingHealthKit, setResettingHealthKit] = useState(false);

  // DEBUG TEMPORARIO — investigacao do bug "historico de Saude sempre da
  // erro": a flag HEALTHKIT_CONNECTED_KEY (Keychain via expo-secure-store)
  // sobrevive a desinstalar/reinstalar o app (Keychain no iOS nao e limpo
  // por reinstalacao), entao um device que testou o HealthKit antes do
  // build atual pode ter essa flag "true" sem nunca ter concluido uma
  // autorizacao de verdade NESTE binario — o app entao pula
  // requestAuthorization achando que ja esta conectado. Este botao apaga a
  // flag e chama requestHealthKitPermissions() de novo, forcando o dialogo
  // real do sistema a aparecer. Remover depois de confirmado.
  const handleDebugResetHealthKit = async () => {
    setResettingHealthKit(true);
    try {
      await SecureStore.deleteItemAsync(HEALTHKIT_CONNECTED_KEY);
      const granted = await requestHealthKitPermissions();
      console.log('[DEBUG resetHealthKit] requestHealthKitPermissions() ->', granted);
      if (granted) {
        await SecureStore.setItemAsync(HEALTHKIT_CONNECTED_KEY, 'true');
      }
      Alert.alert(
        'HealthKit resetado',
        granted
          ? 'Flag limpa e permissao solicitada de novo. Confira Ajustes > Saude > Acesso a Apps agora — o Tryv deveria aparecer na lista.'
          : 'Flag limpa, mas requestHealthKitPermissions() retornou false (ou lancou excecao — ver console). O app ainda pode nao aparecer em Ajustes > Saude.'
      );
    } catch (err) {
      console.error('[DEBUG resetHealthKit] falhou:', err);
      Alert.alert('Erro ao resetar', 'Veja o console pra detalhes.');
    } finally {
      setResettingHealthKit(false);
    }
  };

  /*
   * Marketplace desativado pre-lancamento — este fetch (isTrainer) so
   * alimentava a opcao "Tornar-se profissional parceiro" / "Meu painel
   * profissional" mais abaixo, tambem comentada. Nao apagar: reativar os 2
   * blocos juntos no relancamento do marketplace de profissionais.
   *
   * useFocusEffect(
   *   useCallback(() => {
   *     let active = true;
   *     getMyTrainerProfile()
   *       .then(() => {
   *         if (active) setIsTrainer(true);
   *       })
   *       .catch(() => {
   *         if (active) setIsTrainer(false);
   *       });
   *     return () => {
   *       active = false;
   *     };
   *   }, [])
   * );
   */

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      listUserPosts(user.id)
        .then((posts) => {
          if (active) setMyPosts(posts);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [user])
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      Promise.all([listFollowers(user.id), listFollowing(user.id)])
        .then(([followers, following]) => {
          if (active) {
            setFollowersCount(followers.length);
            setFollowingCount(following.length);
          }
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [user])
  );

  // Selo Pro / Team sao so exibicao — qualquer falha (ex: rede) simplesmente
  // nao mostra nada, sem bloquear o resto do perfil.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      getUserBadges(user.id)
        .then((data) => {
          if (active) setBadges(data);
        })
        .catch(() => {
          if (active) setBadges(null);
        });
      return () => {
        active = false;
      };
    }, [user])
  );

  /*
   * Marketplace desativado pre-lancamento — secao "Desafios de
   * profissionais" comentada mais abaixo (junto com este fetch, exclusivo
   * dela). Nao apagar: reativar os 2 blocos juntos no relancamento.
   *
   * useFocusEffect(
   *   useCallback(() => {
   *     let active = true;
   *     listMyActiveChallenges({ is_official: false })
   *       .then(async (challenges) => {
   *         const withDetails = await Promise.all(
   *           challenges.map(async (challenge) => ({
   *             challenge,
   *             trainer: challenge.trainer_id ? await getTrainer(challenge.trainer_id).catch(() => null) : null,
   *             heatmapDays: await (challenge.goal_type === 'manual'
   *               ? listMyChallengeCheckins(challenge.id).then((checkins) => buildChallengeHeatmapDays(challenge, checkins))
   *               : getChallengeProgress(challenge.id).then((progress) => buildAutomaticChallengeHeatmapDays(challenge, progress))
   *             ).catch(() => []),
   *           }))
   *         );
   *         if (active) setPersonalChallenges(withDetails);
   *       })
   *       .catch(() => {
   *         if (active) setPersonalChallenges([]);
   *       });
   *     return () => {
   *       active = false;
   *     };
   *   }, [])
   * );
   */

  return (
    <ScreenBackground3>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Text style={styles.logo}>Tryv</Text>

        <Avatar initials={user ? getInitials(user.name) : '?'} size={88} style={styles.avatar} />
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>

        <Pressable style={styles.followStatsRow} onPress={() => router.push('/social/follows')}>
          <View style={styles.followStat}>
            <Text style={styles.followStatNumber}>{followersCount}</Text>
            <Text style={styles.followStatLabel}>Seguidores</Text>
          </View>
          <View style={styles.followStatDivider} />
          <View style={styles.followStat}>
            <Text style={styles.followStatNumber}>{followingCount}</Text>
            <Text style={styles.followStatLabel}>Seguindo</Text>
          </View>
        </Pressable>

        <View style={styles.badgesWrap}>
          {/*
            Marketplace desativado pre-lancamento — badge "TEAM {profissional}"
            escondida aqui (so no Perfil, sem tocar em ProfileBadges2.tsx, que
            e compartilhado com social/[userId].tsx e settings/badges.tsx e
            continua mostrando TEAM normalmente nesses 2 lugares). PRO
            continua visivel normalmente. Nao apagar: so tirar o `teams: []`
            no relancamento.

            variant="light" — ProfileBadges2 ainda e escuro por padrao (os 2
            outros usos acima seguem sem migrar), mesmo padrao de prop
            variant ja usado em EmptyFollowingState/ObscuredCard/TextField2
            nesta sessao pra nao afetar quem ainda nao migrou.
          */}
          <ProfileBadges2 badges={badges ? { ...badges, teams: [] } : badges} variant="light" />
        </View>

        {/*
          Marketplace desativado pre-lancamento — secao "Desafios de
          profissionais" escondida (card com heatmap de desafio vinculado a
          um profissional). Nao apagar: reativar junto com o fetch de
          personalChallenges comentado acima.

          {personalChallenges.length > 0 && (
            <View style={styles.challengesSection}>
              <Text style={styles.sectionTitle}>Desafios de profissionais</Text>
              {personalChallenges.map(({ challenge, trainer, heatmapDays }) => (
                <Pressable
                  key={challenge.id}
                  onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } })}
                >
                  <LiquiglassCard style={styles.challengeCard} padding={spacing2.md}>
                    <View style={styles.challengeCardHeader}>
                      <Ionicons name="trophy" size={16} color={colors2.primary} />
                      <View style={styles.challengeCardTexts}>
                        <Text style={styles.challengeCardTitle}>{challenge.title}</Text>
                        {!!trainer && <Text style={styles.challengeCardTrainer}>{trainer.user_name}</Text>}
                      </View>
                    </View>
                    <HeatmapGrid
                      days={heatmapDays}
                      todayKey={todayKey()}
                      cellSize={10}
                      showDayNumbers={false}
                      showWeekdayHeaders={false}
                    />
                  </LiquiglassCard>
                </Pressable>
              ))}
            </View>
          )}
        */}

        <Pressable style={styles.optionWrap} onPress={() => router.push('/settings/calorie-goal')}>
          <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
            <View style={styles.optionRow}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="flame" size={20} color={colors3.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Meta calórica diária</Text>
                <Text style={styles.optionSubtitle}>
                  {user?.daily_calorie_goal != null
                    ? `${Math.round(user.daily_calorie_goal)} kcal/dia`
                    : 'Nenhuma meta definida ainda'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
            </View>
          </GlassCard>
        </Pressable>

        <Pressable style={styles.optionWrap} onPress={() => router.push('/subscriptions/pro')}>
          <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
            <View style={styles.optionRow}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="star" size={20} color={colors3.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Tryv Pro</Text>
                <Text style={styles.optionSubtitle}>Insights, prontidão, IA e mais</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
            </View>
          </GlassCard>
        </Pressable>

        <Pressable style={styles.optionWrap} onPress={() => router.push('/settings/badges')}>
          <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
            <View style={styles.optionRow}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="ribbon" size={20} color={colors3.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Meus selos e conquistas</Text>
                <Text style={styles.optionSubtitle}>Status Pro e vínculos com profissionais</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
            </View>
          </GlassCard>
        </Pressable>

        {/*
          Marketplace desativado pre-lancamento — 2 opcoes de navegacao
          escondidas: "Profissionais" (lista de descoberta) e "Tornar-se
          profissional parceiro" / "Meu painel profissional" (cadastro de
          profissional, junto com o fetch de isTrainer comentado acima). Nao
          apagar: reativar no relancamento do marketplace de profissionais.

          <Pressable style={styles.optionWrap} onPress={() => router.push('/trainers')}>
            <LiquiglassCard style={styles.optionCard} padding={spacing2.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name="people" size={20} color={colors2.primary} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Profissionais</Text>
                  <Text style={styles.optionSubtitle}>Encontre um profissional certificado</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
              </View>
            </LiquiglassCard>
          </Pressable>

          <Pressable
            style={styles.optionWrap}
            onPress={() => router.push(isTrainer ? '/trainers/me' : '/trainers/register')}
          >
            <LiquiglassCard style={styles.optionCard} padding={spacing2.md}>
              <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name={isTrainer ? 'clipboard' : 'ribbon'} size={20} color={colors2.primary} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>
                    {isTrainer ? 'Meu painel profissional' : 'Tornar-se profissional parceiro'}
                  </Text>
                  <Text style={styles.optionSubtitle}>
                    {isTrainer
                      ? 'Status, edição de perfil e pagamentos'
                      : 'Cadastre seu registro profissional e comece a atender'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
              </View>
            </LiquiglassCard>
          </Pressable>
        */}

        {/* DEBUG TEMPORARIO — ver handleDebugResetHealthKit acima. Remover apos confirmado. */}
        <Pressable style={styles.optionWrap} onPress={handleDebugResetHealthKit} disabled={resettingHealthKit}>
          <GlassCard variant="card" style={styles.optionCard} padding={spacing3.md}>
            <View style={styles.optionRow}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="bug" size={20} color={colors3.error} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>[DEBUG] Resetar conexao HealthKit</Text>
                <Text style={styles.optionSubtitle}>
                  {resettingHealthKit ? 'Resetando...' : 'Limpa a flag local e pede autorizacao de novo'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
            </View>
          </GlassCard>
        </Pressable>

        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Meus posts</Text>
          {myPosts.length > 0 ? (
            <PostGrid2 posts={myPosts} variant="light" />
          ) : (
            <Text style={styles.emptyText}>Você ainda não publicou nada.</Text>
          )}
        </View>
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    alignItems: 'center',
    paddingTop: spacing3.xl,
    padding: spacing3.containerMargin,
    paddingBottom: spacing3.xl,
  },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary, marginBottom: spacing3.lg },
  avatar: { marginBottom: spacing3.md },
  name: { ...typography3.headlineMd, fontSize: 22 },
  email: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: spacing3.xs, marginBottom: spacing3.sm },

  followStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.lg,
    marginBottom: spacing3.lg,
  },
  followStat: { alignItems: 'center', minWidth: 72 },
  followStatDivider: { width: 1, height: 28, backgroundColor: colors3.outlineVariant },
  followStatNumber: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 20, color: colors3.onSurface },
  followStatLabel: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, marginTop: 2 },

  badgesWrap: { marginBottom: spacing3.lg, width: '100%' },

  challengesSection: { width: '100%', gap: spacing2.sm, marginBottom: spacing2.lg },
  challengeCard: { gap: spacing2.sm },
  challengeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  challengeCardTexts: { flex: 1, gap: 2 },
  challengeCardTitle: { ...typography2.bodyMd, fontWeight: '700', fontSize: 14 },
  challengeCardTrainer: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },

  optionWrap: { width: '100%', marginBottom: spacing3.sm },
  optionCard: { width: '100%' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: { flex: 1, gap: 4 },
  optionTitle: { ...typography3.bodyMd, fontWeight: '700' },
  optionSubtitle: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },

  postsSection: { width: '100%', marginTop: spacing3.lg, gap: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 18 },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
});
