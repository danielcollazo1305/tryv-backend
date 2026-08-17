import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { PostGrid } from '@/components/PostGrid';
import { ProfileBadges } from '@/components/ProfileBadges';
import { Post, listFollowers, listFollowing, listUserPosts } from '@/services/social';
import { getMyTrainerProfile } from '@/services/trainers';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [isTrainer, setIsTrainer] = useState(false);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

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

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={32} color={colors.accent} />
      </View>
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
        <ProfileBadges badges={badges} />
      </View>

      <Pressable style={styles.optionWrap} onPress={() => router.push('/settings/calorie-goal')}>
        <Card style={styles.optionCard}>
          <View style={styles.optionIconWrap}>
            <Ionicons name="flame" size={20} color={colors.accent} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Meta calorica diaria</Text>
            <Text style={styles.optionSubtitle}>
              {user?.daily_calorie_goal != null
                ? `${Math.round(user.daily_calorie_goal)} kcal/dia`
                : 'Nenhuma meta definida ainda'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      <Pressable style={styles.optionWrap} onPress={() => router.push('/subscriptions/pro')}>
        <Card style={styles.optionCard}>
          <View style={styles.optionIconWrap}>
            <Ionicons name="star" size={20} color={colors.accent} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Tryv Pro</Text>
            <Text style={styles.optionSubtitle}>Insights, prontidao, IA e mais</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      <Pressable style={styles.optionWrap} onPress={() => router.push('/settings/badges')}>
        <Card style={styles.optionCard}>
          <View style={styles.optionIconWrap}>
            <Ionicons name="ribbon" size={20} color={colors.accent} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Meus selos e conquistas</Text>
            <Text style={styles.optionSubtitle}>Status Pro e vinculos com profissionais</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      <Pressable style={styles.optionWrap} onPress={() => router.push('/trainers')}>
        <Card style={styles.optionCard}>
          <View style={styles.optionIconWrap}>
            <Ionicons name="people" size={20} color={colors.accent} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Profissionais</Text>
            <Text style={styles.optionSubtitle}>Encontre um profissional certificado</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      <Pressable
        style={styles.optionWrap}
        onPress={() => router.push(isTrainer ? '/trainers/me' : '/trainers/register')}
      >
        <Card style={styles.optionCard}>
          <View style={styles.optionIconWrap}>
            <Ionicons name={isTrainer ? 'clipboard' : 'ribbon'} size={20} color={colors.accent} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>
              {isTrainer ? 'Meu painel profissional' : 'Tornar-se profissional parceiro'}
            </Text>
            <Text style={styles.optionSubtitle}>
              {isTrainer
                ? 'Status, edicao de perfil e pagamentos'
                : 'Cadastre seu registro profissional e comece a atender'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      <View style={styles.postsSection}>
        <Text style={styles.sectionTitle}>Meus posts</Text>
        {myPosts.length > 0 ? (
          <PostGrid posts={myPosts} />
        ) : (
          <Text style={styles.emptyText}>Voce ainda nao publicou nada.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  name: { ...typography.h2 },
  email: { ...typography.bodySecondary, marginTop: spacing.xs, marginBottom: spacing.sm },

  followStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  followStat: { alignItems: 'center', minWidth: 72 },
  followStatDivider: { width: 1, height: 28, backgroundColor: colors.border },
  followStatNumber: { fontSize: 20, fontWeight: '800', color: colors.text },
  followStatLabel: { ...typography.caption, marginTop: 2 },

  badgesWrap: { marginBottom: spacing.lg },

  optionWrap: { width: '100%', marginBottom: spacing.sm },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: { flex: 1, gap: spacing.xs },
  optionTitle: { ...typography.body, fontWeight: '600' },
  optionSubtitle: { ...typography.caption },

  postsSection: { width: '100%', marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: { ...typography.h3 },
  emptyText: { ...typography.bodySecondary },
});
