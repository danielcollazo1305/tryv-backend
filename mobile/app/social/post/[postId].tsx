import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { PostCard } from '@/components/PostCard';
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

  const handleDelete = () => {
    if (!postId) return;
    Alert.alert('Excluir post?', 'Essa acao nao pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deletePost(postId);
            router.back();
          } catch (err) {
            setError(getApiErrorMessage(err, 'Nao foi possivel excluir o post.'));
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const isOwnPost = post?.user_id === user?.id;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Post</Text>
        <View style={styles.headerActions}>
          {isOwnPost && (
            <Pressable onPress={handleDelete} hitSlop={12} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
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
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  centered: { alignItems: 'center', marginTop: spacing.xl },
  error: { color: colors.danger, textAlign: 'center' },
});
