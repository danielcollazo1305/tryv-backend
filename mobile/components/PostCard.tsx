import React, { useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import { Post, formatPostDate } from '@/services/social';
import { colors, radius, spacing, typography } from '@/constants/theme';

interface PostCardProps {
  post: Post;
  onPressAuthor: () => void;
  onToggleLike: () => void;
  onPressComments: () => void;
}

export function PostCard({ post, onPressAuthor, onToggleLike, onPressComments }: PostCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleLikePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    onToggleLike();
  };

  return (
    <Card style={styles.card}>
      <Pressable style={styles.authorRow} onPress={onPressAuthor} hitSlop={4}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={16} color={colors.accent} />
        </View>
        <Text style={styles.authorName}>{post.author}</Text>
        {post.visibility === 'private' && (
          <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
        )}
        <Text style={styles.date}>{formatPostDate(post.created_at)}</Text>
      </Pressable>

      {!!post.media_url && <Image source={{ uri: post.media_url }} style={styles.media} />}

      {!!post.caption && <Text style={styles.caption}>{post.caption}</Text>}

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={handleLikePress} hitSlop={8}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons
              name={post.is_liked_by_me ? 'heart' : 'heart-outline'}
              size={22}
              color={post.is_liked_by_me ? colors.danger : colors.textSecondary}
            />
          </Animated.View>
          <Text style={styles.actionCount}>{post.likes_count}</Text>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={onPressComments} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.actionCount}>{post.comments_count}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden', gap: 0 },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: { ...typography.bodySecondary, color: colors.text, fontWeight: '600', flex: 1 },
  date: { ...typography.caption },
  media: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceElevated },
  caption: { ...typography.bodySecondary, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.lg, padding: spacing.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionCount: { ...typography.bodySecondary },
});
