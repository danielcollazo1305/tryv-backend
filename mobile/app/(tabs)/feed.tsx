import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { EmptyFollowingState } from '@/components/EmptyFollowingState';
import { PostCard2 } from '@/components/PostCard2';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Post, getFeed, likePost, listFollowing, unlikePost } from '@/services/social';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const PAGE_SIZE = 20;

export default function FeedScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  // Badges (Pro/Team) do autor de cada post — GET /users/{id}/badges,
  // mesmo endpoint usado no Perfil Publico, so que buscado em paralelo pra
  // cada autor distinto da pagina em vez de um unico usuario.
  const [badgesByUser, setBadgesByUser] = useState<Record<string, UserBadges | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // "Nao sigo ninguem" (item 2) e um estado DIFERENTE de "feed vazio" —
  // GET /feed traz posts publicos de qualquer usuario, entao ele pode nao
  // estar vazio mesmo sem seguir ninguem (posts publicos de estranhos). A
  // decisao aqui foi priorizar o convite pra seguir gente sempre que
  // followingCount for 0, substituindo o feed inteiro (mesmo que existam
  // posts publicos pra mostrar) — mesmo padrao de apps de referencia, que
  // tratam "nao segue ninguem" como o estado prioritario a resolver.
  const [followingCount, setFollowingCount] = useState<number | null>(null);

  const fetchBadgesFor = useCallback((postsToFetch: Post[]) => {
    const uniqueUserIds = Array.from(new Set(postsToFetch.map((p) => p.user_id)));
    uniqueUserIds.forEach((userId) => {
      getUserBadges(userId)
        .then((data) => setBadgesByUser((prev) => ({ ...prev, [userId]: data })))
        .catch(() => setBadgesByUser((prev) => ({ ...prev, [userId]: null })));
    });
  }, []);

  const fetchFirstPage = useCallback(async () => {
    setError(null);
    try {
      const [data, myFollowing] = await Promise.all([
        getFeed(PAGE_SIZE, 0),
        user ? listFollowing(user.id) : Promise.resolve([]),
      ]);
      setPosts(data);
      setHasMore(data.length === PAGE_SIZE);
      setFollowingCount(myFollowing.length);
      fetchBadgesFor(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o feed.'));
    }
  }, [fetchBadgesFor, user]);

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
      fetchBadgesFor(data);
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

  // followingCount === 0 substitui o feed inteiro pelo convite pra seguir
  // gente (ver nota no state) — so depois de carregar, pra nao piscar o
  // estado vazio antes da primeira resposta chegar.
  const showEmptyFollowingState = !loading && followingCount === 0;

  return (
    <ScreenBackground2 style={styles.flex}>
      <FlatList
        data={showEmptyFollowingState ? [] : posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors2.violet} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.logo}>Tryv</Text>
            <View style={styles.headerTop}>
              <Text style={styles.title}>Feed</Text>
              <View style={styles.headerActions}>
                {/*
                  Entrada pro Descobrir (item 3) — o pedido original nao
                  especificava de onde essa tela seria acessada, so a
                  estrutura interna dela. Icone de busca no topo do Feed e o
                  padrao mais comum pra "encontrar pessoas" em apps sociais
                  (decisao minha, documentada aqui).
                */}
                <Pressable onPress={() => router.push('/social/discover')} hitSlop={12}>
                  <Ionicons name="search" size={22} color={colors2.onSurfaceVariant} />
                </Pressable>
                {/* Entrada pro Perfil (Perfil saiu da tab bar, ver (tabs)/_layout.tsx). */}
                <ProfileAvatarButton size={32} />
              </View>
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => (
          <PostCard2
            post={item}
            badges={badgesByUser[item.user_id]}
            onPressAuthor={() => handlePressAuthor(item)}
            onToggleLike={() => handleToggleLike(item)}
            onPressComments={() =>
              router.push({ pathname: '/social/comments/[postId]', params: { postId: item.id } })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
        onEndReachedThreshold={0.4}
        onEndReached={handleLoadMore}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors2.violet} style={styles.footerLoading} /> : null
        }
        ListEmptyComponent={
          !loading ? (
            showEmptyFollowingState ? (
              <EmptyFollowingState />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={32} color={colors2.onSurfaceVariant} />
                <Text style={styles.emptyText}>Nenhum post ainda. Siga outras pessoas ou crie o primeiro!</Text>
              </View>
            )
          ) : null
        }
      />

      <Pressable style={styles.fab} onPress={() => router.push('/social/new')}>
        <Ionicons name="add" size={28} color={colors2.white} />
      </Pressable>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.xl * 2 },
  header: { gap: spacing2.xs, marginBottom: spacing2.md },
  logo: { ...typography2.displayHero, fontSize: 36 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  title: { ...typography2.headlineLgMobile, fontSize: 26 },
  error: { color: colors2.danger, textAlign: 'center' },
  loading: { marginTop: spacing2.sm },
  footerLoading: { marginVertical: spacing2.md },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

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
});
