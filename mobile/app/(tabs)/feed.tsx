import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { PostCard } from '@/components/PostCard';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Post, getFeed, likePost, unlikePost } from '@/services/social';
import { colors, spacing, typography } from '@/constants/theme';

const PAGE_SIZE = 20;

export default function FeedScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFirstPage = useCallback(async () => {
    setError(null);
    try {
      const data = await getFeed(PAGE_SIZE, 0);
      setPosts(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o feed.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchFirstPage().finally(() => setLoading(false));
    }, [fetchFirstPage])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFirstPage();
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await getFeed(PAGE_SIZE, posts.length);
      setPosts((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // Silencioso: o usuario ja ve o que carregou antes, e o proximo scroll tenta de novo.
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    const wasLiked = post.is_liked_by_me;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, is_liked_by_me: !wasLiked, likes_count: p.likes_count + (wasLiked ? -1 : 1) } : p
      )
    );
    try {
      if (wasLiked) await unlikePost(post.id);
      else await likePost(post.id);
    } catch {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, is_liked_by_me: wasLiked, likes_count: p.likes_count + (wasLiked ? 1 : -1) } : p
        )
      );
    }
  };

  const handlePressAuthor = (post: Post) => {
    if (post.user_id === user?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push({ pathname: '/social/[userId]', params: { userId: post.user_id } });
    }
  };

  return (
    <View style={styles.flex}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Feed</Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPressAuthor={() => handlePressAuthor(item)}
            onToggleLike={() => handleToggleLike(item)}
            onPressComments={() =>
              router.push({ pathname: '/social/comments/[postId]', params: { postId: item.id } })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        onEndReachedThreshold={0.4}
        onEndReached={handleLoadMore}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.accent} style={styles.footerLoading} /> : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhum post ainda. Siga outras pessoas ou crie o primeiro!</Text>
            </View>
          ) : null
        }
      />

      <Pressable style={styles.fab} onPress={() => router.push('/social/new')}>
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl * 2 },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { ...typography.h1 },
  error: { color: colors.danger, textAlign: 'center' },
  loading: { marginTop: spacing.sm },
  footerLoading: { marginVertical: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
