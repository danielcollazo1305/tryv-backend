import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { PostGrid } from '@/components/PostGrid';
import { ProfileBadges } from '@/components/ProfileBadges';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Post, UserBrief, followUser, listFollowers, listFollowing, listUserPosts, unfollowUser } from '@/services/social';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors, radius, spacing, typography } from '@/constants/theme';

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
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Perfil</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={colors.accent} />
            </View>
            <Text style={styles.name}>{displayName ?? 'Perfil'}</Text>

            <ProfileBadges badges={badges} />

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{posts.length}</Text>
                <Text style={styles.statLabel}>posts</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{followers.length}</Text>
                <Text style={styles.statLabel}>seguidores</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{following.length}</Text>
                <Text style={styles.statLabel}>seguindo</Text>
              </View>
            </View>

            <Button
              label={isFollowing ? 'Deixar de seguir' : 'Seguir'}
              variant={isFollowing ? 'secondary' : 'primary'}
              onPress={handleToggleFollow}
              loading={followBusy}
            />
          </View>

          {posts.length > 0 ? (
            <PostGrid posts={posts} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhum post visivel ainda.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.lg },
  error: { color: colors.danger, textAlign: 'center' },

  profileHeader: { alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.h2 },
  statsRow: { flexDirection: 'row', gap: spacing.xl },
  stat: { alignItems: 'center' },
  statNumber: { ...typography.h3 },
  statLabel: { ...typography.caption },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },
});
