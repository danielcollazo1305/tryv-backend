import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { PostCard } from '@/components/PostCard';
import { useModeration } from '@/components/moderation/useModeration';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Post, deletePost, getPost, likePost, unlikePost } from '@/services/social';
import { colors, spacing, typography } from '@/constants/theme';

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      setPost(await getPost(postId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar este post.'));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      fetchPost();
    }, [fetchPost])
  );

  const handleToggleLike = async () => {
    if (!post) return;
    const wasLiked = post.is_liked_by_me;
    setPost({ ...post, is_liked_by_me: !wasLiked, likes_count: post.likes_count + (wasLiked ? -1 : 1) });
    try {
      if (wasLiked) await unlikePost(post.id);
      else await likePost(post.id);
    } catch {
      setPost((prev) =>
        prev ? { ...prev, is_liked_by_me: wasLiked, likes_count: prev.likes_count + (wasLiked ? 1 : -1) } : prev
      );
    }
  };

  const handlePressAuthor = () => {
    if (!post) return;
    if (post.user_id === user?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push({ pathname: '/social/[userId]', params: { userId: post.user_id } });
    }
  };

  // A confirmacao de exclusao e a do menu "..." (components/moderation/useModeration, confirmDeletePost).
  const performDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deletePost(id);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel excluir o post.'));
      setDeleting(false);
    }
  };

  // "⋯": post de OUTRA pessoa = Denunciar / Bloquear (bloqueou ou denunciou: fecha o post, o Social recarrega ao focar);
  // post MEU = Editar legenda / Mudar privacidade / Excluir (o post mostrado e trocado pelo devolvido pelo servidor).
  const { openMenu, sheet } = useModeration({
    onPostUpdated: (updated) => setPost(updated),
    onDeletePost: performDelete,
    onBlocked: () => router.back(),
    onContentRemoved: () => router.back(),
  });

  const isOwnPost = post?.user_id === user?.id;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Post</Text>
        <View style={styles.headerActions}>
          {!!post && (
            <Pressable
              onPress={() =>
                openMenu({
                  kind: 'post',
                  id: post.id,
                  authorId: post.user_id,
                  authorName: post.author,
                  isOwn: isOwnPost,
                  caption: post.caption,
                  visibility: post.visibility,
                })
              }
              disabled={deleting}
              hitSlop={12}
              style={styles.moreButton}
              accessibilityRole="button"
              accessibilityLabel="Mais opções"
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
              )}
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && post && (
          <PostCard
            post={post}
            onPressAuthor={handlePressAuthor}
            onToggleLike={handleToggleLike}
            onPressComments={() =>
              router.push({ pathname: '/social/comments/[postId]', params: { postId: post.id } })
            }
          />
        )}
      </ScrollView>
      {sheet}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  moreButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -10 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  centered: { alignItems: 'center', marginTop: spacing.xl },
  error: { color: colors.danger, textAlign: 'center' },
});
