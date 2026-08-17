import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { PostGrid2 } from '@/components/PostGrid2';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Post, UserBrief, followUser, listFollowers, listFollowing, listUserPosts, unfollowUser } from '@/services/social';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user: currentUser } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [followers, setFollowers] = useState<UserBrief[]>([]);
  const [following, setFollowing] = useState<UserBrief[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  // Nao ha um GET /users/{id} generico para o nome — usamos o autor dos
  // posts (mais confiavel) ou, se ja seguimos essa pessoa, a entrada
  // correspondente na nossa propria lista de "following".
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se por algum motivo o proprio usuario cair aqui, manda pro tab de Perfil.
  useEffect(() => {
    if (userId && currentUser?.id === userId) {
      router.replace('/(tabs)/profile');
    }
  }, [userId, currentUser?.id]);

  const fetchAll = useCallback(async () => {
    if (!userId || !currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const [postsData, followersData, followingData, myFollowingData, badgesData] = await Promise.all([
        listUserPosts(userId),
        listFollowers(userId),
        listFollowing(userId),
        listFollowing(currentUser.id),
        getUserBadges(userId).catch(() => null),
      ]);
      setPosts(postsData);
      setFollowers(followersData);
      setFollowing(followingData);
      setIsFollowing(myFollowingData.some((u) => u.id === userId));
      setDisplayName(postsData[0]?.author ?? myFollowingData.find((u) => u.id === userId)?.name ?? null);
      setBadges(badgesData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar este perfil.'));
    } finally {
      setLoading(false);
    }
  }, [userId, currentUser]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const handleToggleFollow = async () => {
    if (!userId) return;
    setFollowBusy(true);
    setError(null);
    try {
      if (isFollowing) await unfollowUser(userId);
      else await followUser(userId);
      await fetchAll();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel atualizar o status de seguir.'));
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors2.violet} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {!!error && <Text style={styles.error}>{error}</Text>}

          <LiquiglassCard style={styles.profileCard}>
            <Avatar initials={displayName ? getInitials(displayName) : '?'} size={100} />
            <Text style={styles.name}>{displayName ?? 'Perfil'}</Text>

            <ProfileBadges2 badges={badges} />

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{followers.length}</Text>
                <Text style={styles.statLabel}>Seguidores</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{following.length}</Text>
                <Text style={styles.statLabel}>Seguindo</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{posts.length}</Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
            </View>

            <Button2
              label={isFollowing ? 'Seguindo' : 'Seguir'}
              variant={isFollowing ? 'secondary' : 'primary'}
              onPress={handleToggleFollow}
              loading={followBusy}
            />
          </LiquiglassCard>

          <View style={styles.postsSection}>
            <Text style={styles.sectionTitle}>Posts</Text>
            {posts.length > 0 ? (
              <PostGrid2 posts={posts} />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={28} color={colors2.onSurfaceVariant} />
                <Text style={styles.emptyText}>Nenhum post visivel ainda.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.lg },
  error: { color: colors2.danger, textAlign: 'center' },

  profileCard: { alignItems: 'center', gap: spacing2.md },
  name: { ...typography2.headlineLgMobile, fontSize: 22 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.lg, marginTop: spacing2.xs },
  stat: { alignItems: 'center', minWidth: 64 },
  statDivider: { width: 1, height: 32, backgroundColor: colors2.outlineVariant },
  statNumber: { ...typography2.metricMono, fontSize: 18, color: colors2.primary },
  statLabel: { ...typography2.labelCaps, fontSize: 10, marginTop: 2 },

  postsSection: { gap: spacing2.md },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
});
