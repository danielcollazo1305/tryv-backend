import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { HeatmapDay, HeatmapGrid, todayKey } from '@/components/HeatmapGrid';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { PostGrid2 } from '@/components/PostGrid2';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
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
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface PersonalChallengeProgress {
  challenge: Challenge;
  trainer: TrainerPublic | null;
  heatmapDays: HeatmapDay[];
}

/**
 * Migracao liquiglass do Perfil — so troca de tokens/componentes visuais
 * (colors -> colors2, Card -> LiquiglassCard, PostGrid/ProfileBadges ->
 * as versoes 2, avatar generico -> Avatar de iniciais). Toda a logica de
 * dados (badges, contagem de seguidores, deteccao de professor, posts)
 * continua exatamente igual — nenhum useFocusEffect foi alterado.
 *
 * Cabecalho "Tryv" novo no topo (item 2 do pedido): reaproveita o unico
 * estilo de wordmark que ja existe no app (typography2.displayHero,
 * fontSize 36), o mesmo usado em Login/Cadastro — nao existia nenhum
 * cabecalho "Tryv" nas abas principais antes disso (confirmado na
 * investigacao: Home usa saudacao "Ola, {nome}", nao a marca).
 */
export default function ProfileScreen() {
  const { user } = useAuth();
  const [isTrainer, setIsTrainer] = useState(false);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [personalChallenges, setPersonalChallenges] = useState<PersonalChallengeProgress[]>([]);

  // Qualquer falha (404 de "ainda nao e professor" ou erro de rede) cai no
  // mesmo estado — o link "Tornar-se professor" e sempre uma opcao segura.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMyTrainerProfile()
        .then(() => {
          if (active) setIsTrainer(true);
        })
        .catch(() => {
          if (active) setIsTrainer(false);
        });
      return () => {
        active = false;
      };
    }, [])
  );

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

  // Progresso em desafios de Personal Trainer (item 4 da reformulacao de
  // Desafios) — so aparece se houver pelo menos 1 desafio "Personal" ativo
  // (nao mostra secao vazia). Falha aqui nao bloqueia o resto do Perfil.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      listMyActiveChallenges({ is_official: false })
        .then(async (challenges) => {
          const withDetails = await Promise.all(
            challenges.map(async (challenge) => ({
              challenge,
              trainer: challenge.trainer_id ? await getTrainer(challenge.trainer_id).catch(() => null) : null,
              heatmapDays: await (challenge.goal_type === 'manual'
                ? listMyChallengeCheckins(challenge.id).then((checkins) => buildChallengeHeatmapDays(challenge, checkins))
                : getChallengeProgress(challenge.id).then((progress) => buildAutomaticChallengeHeatmapDays(challenge, progress))
              ).catch(() => []),
            }))
          );
          if (active) setPersonalChallenges(withDetails);
        })
        .catch(() => {
          if (active) setPersonalChallenges([]);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <ScreenBackground2>
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
          <ProfileBadges2 badges={badges} />
        </View>

        {/*
          Progresso em desafios de Personal Trainer — posicionada logo
          depois dos badges "Team [Nome]" de proposito: mesmo contexto de
          relacao com o profissional. So aparece se houver desafio Personal
          ativo (nenhuma secao vazia). Heatmap reaproveitado tal qual da
          tela de detalhe do desafio, so em formato compacto.
        */}
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

        <Pressable style={styles.optionWrap} onPress={() => router.push('/settings/calorie-goal')}>
          <LiquiglassCard style={styles.optionCard} padding={spacing2.md}>
            <View style={styles.optionRow}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="flame" size={20} color={colors2.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Meta calórica diária</Text>
                <Text style={styles.optionSubtitle}>
                  {user?.daily_calorie_goal != null
                    ? `${Math.round(user.daily_calorie_goal)} kcal/dia`
                    : 'Nenhuma meta definida ainda'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
            </View>
          </LiquiglassCard>
        </Pressable>

        <Pressable style={styles.optionWrap} onPress={() => router.push('/subscriptions/pro')}>
          <LiquiglassCard style={styles.optionCard} padding={spacing2.md}>
            <View style={styles.optionRow}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="star" size={20} color={colors2.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Tryv Pro</Text>
                <Text style={styles.optionSubtitle}>Insights, prontidão, IA e mais</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
            </View>
          </LiquiglassCard>
        </Pressable>

        <Pressable style={styles.optionWrap} onPress={() => router.push('/settings/badges')}>
          <LiquiglassCard style={styles.optionCard} padding={spacing2.md}>
            <View style={styles.optionRow}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="ribbon" size={20} color={colors2.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Meus selos e conquistas</Text>
                <Text style={styles.optionSubtitle}>Status Pro e vínculos com profissionais</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
            </View>
          </LiquiglassCard>
        </Pressable>

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

        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Meus posts</Text>
          {myPosts.length > 0 ? (
            <PostGrid2 posts={myPosts} />
          ) : (
            <Text style={styles.emptyText}>Você ainda não publicou nada.</Text>
          )}
        </View>
      </ScrollView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    alignItems: 'center',
    paddingTop: spacing2.xl,
    padding: spacing2.containerMargin,
    paddingBottom: spacing2.xl,
  },
  logo: { ...typography2.displayHero, fontSize: 36, marginBottom: spacing2.lg },
  avatar: { marginBottom: spacing2.md },
  name: { ...typography2.headlineMd, fontSize: 22 },
  email: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: spacing2.xs, marginBottom: spacing2.sm },

  followStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.lg,
    marginBottom: spacing2.lg,
  },
  followStat: { alignItems: 'center', minWidth: 72 },
  followStatDivider: { width: 1, height: 28, backgroundColor: colors2.outlineVariant },
  followStatNumber: { ...typography2.metricMono, fontSize: 20 },
  followStatLabel: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant, marginTop: 2 },

  badgesWrap: { marginBottom: spacing2.lg, width: '100%' },

  challengesSection: { width: '100%', gap: spacing2.sm, marginBottom: spacing2.lg },
  challengeCard: { gap: spacing2.sm },
  challengeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  challengeCardTexts: { flex: 1, gap: 2 },
  challengeCardTitle: { ...typography2.bodyMd, fontWeight: '700', fontSize: 14 },
  challengeCardTrainer: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },

  optionWrap: { width: '100%', marginBottom: spacing2.sm },
  optionCard: { width: '100%' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius2.md,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: { flex: 1, gap: 4 },
  optionTitle: { ...typography2.bodyMd, fontWeight: '700' },
  optionSubtitle: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },

  postsSection: { width: '100%', marginTop: spacing2.lg, gap: spacing2.sm },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
});
