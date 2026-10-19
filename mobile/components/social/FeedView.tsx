import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { EmptyFollowingState } from '@/components/EmptyFollowingState';
import { PostCard2 } from '@/components/PostCard2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { ModerationTarget, useModeration } from '@/components/moderation/useModeration';
import { getHttpStatus } from '@/services/contentFilter';
import { replacePostInList } from '@/services/postEdit';
import {
  EXPLORE_EMPTY_MESSAGE,
  EXPLORE_ERROR_MESSAGE,
  EXPLORE_RETRY_LABEL,
  FeedScope,
  ScopeStates,
  applyPage,
  buildPageRequest,
  canLoadMore,
  initialScopeStates,
  patchScope,
  pickInitialScope,
} from '@/services/feedScopes';
import {
  Post,
  checkExploreAvailable,
  deletePost,
  exploreAvailability,
  getExploreFeed,
  getFeed,
  likePost,
  listFollowing,
  unlikePost,
} from '@/services/social';
import { UserBadges, getUserBadges } from '@/services/user';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from '@/app/(tabs)/_layout';

interface FeedViewProps {
  /**
   * Aba visivel no Social. A view fica montada depois da 1a visita (preserva rolagem e estado), entao o recarregamento
   * "ao focar a tela" so roda se ela estiver ativa; se o Social ganhou foco com ela escondida, recarrega quando ela
   * voltar a ser a ativa.
   */
  active?: boolean;
  /** Bloqueou alguem aqui: o Social avisa as outras abas (ex.: Ranking) para recarregarem (ver `refreshKey`). */
  onUserBlocked?: (userId: string) => void;
}

/** Conteudo da aba "Feed" do Social: lista paginada de posts + FAB de novo post. Sem cabecalho (fica no conteiner). */
export function FeedView({ active = true, onUserBlocked }: FeedViewProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Cada visao (Seguindo / Explorar) tem o seu proprio estado (lista, carregando, fim, cursor/offset) e ele e PRESERVADO ao
  // alternar. O ref espelha o estado para montar o pedido da proxima pagina sem depender de closures antigas.
  const statesRef = useRef<ScopeStates>(initialScopeStates());
  const [states, setStatesState] = useState<ScopeStates>(statesRef.current);
  const update = useCallback((fn: (s: ScopeStates) => ScopeStates) => {
    statesRef.current = fn(statesRef.current);
    setStatesState(statesRef.current);
  }, []);
  const [scope, setScopeState] = useState<FeedScope>('following');
  const scopeRef = useRef<FeedScope>('following');
  const setScope = useCallback((next: FeedScope) => {
    scopeRef.current = next;
    setScopeState(next);
  }, []);
  // O Explorar so aparece se o servidor o liberou (sem novo build para ligar): descoberto uma vez por sessao.
  const [exploreAvailable, setExploreAvailable] = useState(false);
  const initialPickedRef = useRef(false);
  const tokenRef = useRef<Record<FeedScope, number>>({ following: 0, explore: 0 });
  const listRef = useRef<FlatList<Post>>(null);
  const scrollOffsets = useRef<Record<FeedScope, number>>({ following: 0, explore: 0 });
  const [followingError, setFollowingError] = useState<string | null>(null);
  // Badges (Pro/Team) do autor de cada post — GET /users/{id}/badges,
  // mesmo endpoint usado no Perfil Publico, so que buscado em paralelo pra
  // cada autor distinto da pagina em vez de um unico usuario.
  const [badgesByUser, setBadgesByUser] = useState<Record<string, UserBadges | null>>({});

  // "Nao sigo ninguem" (item 2) e um estado DIFERENTE de "feed vazio" — priorizamos o convite pra seguir gente na visao
  // Seguindo sempre que followingCount for 0, substituindo a lista (mesmo padrao de apps de referencia).
  const [followingCount, setFollowingCount] = useState<number | null>(null);

  const fetchBadgesFor = useCallback((postsToFetch: Post[]) => {
    const uniqueUserIds = Array.from(new Set(postsToFetch.map((p) => p.user_id)));
    uniqueUserIds.forEach((userId) => {
      getUserBadges(userId)
        .then((data) => setBadgesByUser((prev) => ({ ...prev, [userId]: data })))
        .catch(() => setBadgesByUser((prev) => ({ ...prev, [userId]: null })));
    });
  }, []);

  /** Pagina de uma visao. reset = do topo (abrir/recarregar/puxar): sem offset e SEM cursor. Resposta antiga (de uma recarga que ja foi superada) e descartada. */
  const fetchScopePage = useCallback(
    async (target: FeedScope, reset: boolean, flag: 'loading' | 'refreshing' | 'loadingMore') => {
      if (reset) tokenRef.current[target] += 1;
      const token = tokenRef.current[target];
      update((s) => patchScope(s, target, { [flag]: true }));
      const request = buildPageRequest(target, statesRef.current[target], reset);
      try {
        let result: { posts: Post[]; nextCursor?: string | null };
        if (target === 'following') {
          const [posts, myFollowing] = await Promise.all([
            getFeed(request.limit, request.offset ?? 0, 'following'),
            reset && user ? listFollowing(user.id) : Promise.resolve(null),
          ]);
          if (token !== tokenRef.current[target]) return;
          if (myFollowing) setFollowingCount(myFollowing.length);
          setFollowingError(null);
          result = { posts };
        } else {
          result = await getExploreFeed(request.limit, request.cursor);
          if (token !== tokenRef.current[target]) return;
        }
        update((s) => ({
          ...s,
          [target]: { ...applyPage(s[target], target, result, reset), loading: false, refreshing: false, loadingMore: false },
        }));
        fetchBadgesFor(result.posts);
      } catch (err) {
        if (token !== tokenRef.current[target]) return;
        if (target === 'explore' && getHttpStatus(err) === 404) {
          // O servidor desligou o Explorar: some o seletor e volta para o Seguindo (sem mostrar a mensagem do servidor).
          exploreAvailability.markUnavailable();
          setExploreAvailable(false);
          update((s) => patchScope(s, 'explore', { loading: false, refreshing: false, loadingMore: false }));
          if (scopeRef.current === 'explore') {
            setScope('following');
            if (!statesRef.current.following.loaded) fetchScopePage('following', true, 'loading');
          }
          return;
        }
        if (flag === 'loadingMore') {
          // Silencioso: o usuario ja ve o que carregou antes, e o proximo scroll tenta de novo.
          update((s) => patchScope(s, target, { loadingMore: false }));
          return;
        }
        if (target === 'following') setFollowingError(getApiErrorMessage(err, 'Não foi possível carregar o feed.'));
        update((s) => patchScope(s, target, { error: true, loading: false, refreshing: false, loadingMore: false }));
      }
    },
    [fetchBadgesFor, setScope, update, user]
  );

  const reload = useCallback(async () => {
    const available = await checkExploreAvailable();
    setExploreAvailable(available);
    let target = scopeRef.current;
    if (!initialPickedRef.current) {
      // 1a abertura: Seguindo por padrao; se nao sigo ninguem e o Explorar esta liberado, abre no Explorar.
      initialPickedRef.current = true;
      let count: number | null = null;
      if (available && user) {
        try {
          count = (await listFollowing(user.id)).length;
          setFollowingCount(count);
        } catch {
          count = null;
        }
      }
      target = pickInitialScope(available, count);
      setScope(target);
    } else if (!available && target === 'explore') {
      target = 'following';
      setScope('following');
    }
    await fetchScopePage(target, true, 'loading');
  }, [fetchScopePage, setScope, user]);

  const activeRef = useRef(active);
  activeRef.current = active;
  const staleRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (activeRef.current) reload();
      else staleRef.current = true;
    }, [reload])
  );

  useEffect(() => {
    if (active && staleRef.current) {
      staleRef.current = false;
      reload();
    }
  }, [active, reload]);

  const handleRefresh = async () => {
    await fetchScopePage(scopeRef.current, true, 'refreshing');
  };

  const handleLoadMore = () => {
    const current = scopeRef.current;
    if (!canLoadMore(statesRef.current[current])) return;
    fetchScopePage(current, false, 'loadingMore');
  };

  // Troca de visao: nao recarrega se ela ja foi carregada (o estado fica como estava); restaura a rolagem de cada uma.
  const selectScope = (next: FeedScope) => {
    if (next === scopeRef.current) return;
    setScope(next);
    if (!statesRef.current[next].loaded) fetchScopePage(next, true, 'loading');
    const saved = scrollOffsets.current[next] ?? 0;
    setTimeout(() => listRef.current?.scrollToOffset({ offset: saved, animated: false }), 0);
  };

  // Aplica a mesma mudanca nos posts das DUAS visoes (curtir, bloquear, denunciar, excluir valem onde o post aparecer).
  const mapAllPosts = useCallback(
    (fn: (posts: Post[]) => Post[]) => {
      update((s) => ({
        following: { ...s.following, posts: fn(s.following.posts) },
        explore: { ...s.explore, posts: fn(s.explore.posts) },
      }));
    },
    [update]
  );

  const handleToggleLike = async (post: Post) => {
    const wasLiked = post.is_liked_by_me;
    mapAllPosts((list) =>
      list.map((p) =>
        p.id === post.id ? { ...p, is_liked_by_me: !wasLiked, likes_count: p.likes_count + (wasLiked ? -1 : 1) } : p
      )
    );
    try {
      if (wasLiked) await unlikePost(post.id);
      else await likePost(post.id);
    } catch {
      mapAllPosts((list) =>
        list.map((p) =>
          p.id === post.id ? { ...p, is_liked_by_me: wasLiked, likes_count: p.likes_count + (wasLiked ? 1 : -1) } : p
        )
      );
    }
  };

  // Moderacao: bloquear remove NA HORA da lista todos os posts da pessoa; denunciar remove o post; excluir (meu) chama
  // DELETE /posts/{id} e remove da lista.
  const handleBlocked = useCallback(
    (blockedId: string) => {
      mapAllPosts((list) => list.filter((p) => p.user_id !== blockedId));
      onUserBlocked?.(blockedId);
    },
    [mapAllPosts, onUserBlocked]
  );
  const handleContentRemoved = useCallback(
    (target: ModerationTarget) => {
      if (target.kind === 'post') mapAllPosts((list) => list.filter((p) => p.id !== target.id));
    },
    [mapAllPosts]
  );
  const handleDeleteOwnPost = useCallback(
    async (postId: string) => {
      try {
        await deletePost(postId);
        mapAllPosts((list) => list.filter((p) => p.id !== postId));
      } catch (err) {
        Alert.alert('Não foi possível excluir o post', getApiErrorMessage(err, 'Tente novamente mais tarde.'));
      }
    },
    [mapAllPosts]
  );
  const handlePostUpdated = useCallback(
    (updated: Post) => mapAllPosts((list) => replacePostInList(list, updated)),
    [mapAllPosts]
  );
  const { openMenu, sheet } = useModeration({
    onPostUpdated: handlePostUpdated,
    onBlocked: handleBlocked,
    onContentRemoved: handleContentRemoved,
    onDeletePost: handleDeleteOwnPost,
  });

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
  const current = states[scope];
  const showEmptyFollowingState = scope === 'following' && !current.loading && current.loaded && followingCount === 0;
  const exploreEmpty = scope === 'explore' && current.loaded && !current.loading && !current.error && current.posts.length === 0;
  const loading = current.loading && !current.loaded;

  return (
    <View style={styles.flex}>
      {exploreAvailable && (
        <View style={styles.scopeRow} accessibilityRole="tablist">
          {([['following', 'Seguindo'], ['explore', 'Explorar']] as const).map(([key, label]) => {
            const selected = scope === key;
            return (
              <Pressable
                key={key}
                onPress={() => selectScope(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.scopePill, selected && styles.scopePillSelected]}
              >
                <Text style={[styles.scopePillText, selected && styles.scopePillTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <FlatList
        ref={listRef}
        onScroll={(e) => {
          scrollOffsets.current[scopeRef.current] = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={100}
        data={showEmptyFollowingState ? [] : current.posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={current.refreshing} onRefresh={handleRefresh} tintColor={colors3.primary} />
        }
        ListHeaderComponent={
          current.error || loading ? (
            <View style={styles.header}>
              {current.error && (
                <Text style={styles.error}>{scope === 'explore' ? EXPLORE_ERROR_MESSAGE : followingError ?? 'Não foi possível carregar o feed.'}</Text>
              )}
              {current.error && scope === 'explore' && (
                <Pressable onPress={() => fetchScopePage('explore', true, 'loading')} accessibilityRole="button" style={styles.retry}>
                  <Text style={styles.retryText}>{EXPLORE_RETRY_LABEL}</Text>
                </Pressable>
              )}
              {loading && <ActivityIndicator color={colors3.primary} style={styles.loading} />}
            </View>
          ) : null
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
            onPressMore={() =>
              openMenu({
                kind: 'post',
                id: item.id,
                authorId: item.user_id,
                authorName: item.author,
                isOwn: item.user_id === user?.id,
                caption: item.caption,
                visibility: item.visibility,
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
        onEndReachedThreshold={0.4}
        onEndReached={handleLoadMore}
        ListFooterComponent={
          current.loadingMore ? <ActivityIndicator color={colors3.primary} style={styles.footerLoading} /> : null
        }
        ListEmptyComponent={
          !loading && !current.error ? (
            showEmptyFollowingState ? (
              <EmptyFollowingState variant="light" />
            ) : exploreEmpty ? (
              <View style={styles.empty}>
                <Ionicons name="compass-outline" size={32} color={colors3.onSurfaceVariant} />
                <Text style={styles.emptyText}>{EXPLORE_EMPTY_MESSAGE}</Text>
              </View>
            ) : scope === 'explore' ? null : (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={32} color={colors3.onSurfaceVariant} />
                <Text style={styles.emptyText}>Nenhum post ainda. Siga outras pessoas ou crie o primeiro!</Text>
              </View>
            )
          ) : null
        }
      />

      {/*
        FAB "+" -> /social/new — ja existia no codigo antes desta tarefa (nao
        e novo, so recolorido pro claro). `bottom` calculado a partir da tab
        bar flutuante (TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + safe area, mesma
        formula ja usada no paddingBottom do scroll da Home em (tabs)/index.tsx)
        — antes usava so spacing3.lg fixo, que nao considerava a altura da
        tab bar e por isso o botao ficava parcialmente atras dela.
      */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + spacing3.lg }]}
        onPress={() => router.push('/social/new')}
      >
        <Ionicons name="add" size={28} color={colors3.onPrimary} />
      </Pressable>
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing3.containerMargin, paddingTop: spacing3.sm, paddingBottom: spacing3.xl * 2 },
  header: { gap: spacing3.xs, marginBottom: spacing3.md },
  error: { color: colors3.error, textAlign: 'center' },
  loading: { marginTop: spacing3.sm },
  footerLoading: { marginVertical: spacing3.md },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.sm },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  // Seletor Seguindo / Explorar (so aparece quando o servidor liberou o Explorar): pilulas pequenas, mesmo visual do Social.
  scopeRow: { flexDirection: 'row', gap: spacing3.sm, paddingHorizontal: spacing3.containerMargin, paddingTop: spacing3.xs, paddingBottom: spacing3.xs },
  scopePill: {
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.xs,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  scopePillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  scopePillText: { ...typography3.labelSm, fontSize: 12, textTransform: 'none' },
  scopePillTextSelected: { color: colors3.white, fontFamily: 'Inter_700Bold' },
  retry: { alignSelf: 'center', paddingHorizontal: spacing3.md, paddingVertical: spacing3.xs, borderRadius: radius3.pill, borderWidth: 1, borderColor: colors3.primary },
  retryText: { ...typography3.labelSm, fontSize: 13, color: colors3.primary, textTransform: 'none' },

  fab: {
    position: 'absolute',
    right: spacing3.lg,
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
