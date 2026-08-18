import React, { useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ObscuredCard } from '@/components/ObscuredCard';
import { Post, formatPostDate } from '@/services/social';
import { UserBadges } from '@/services/user';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

interface PostCard2Props {
  post: Post;
  /** undefined = ainda carregando (GET /users/{id}/badges por post, ver Feed), null = carregado e sem badges. */
  badges?: UserBadges | null;
  onPressAuthor: () => void;
  onToggleLike: () => void;
  onPressComments: () => void;
}

/**
 * Equivalente do PostCard.tsx pro design novo — mesma API (post/
 * onPressAuthor/onToggleLike/onPressComments) + badges opcional. PostCard
 * original continua em uso em social/post/[postId].tsx, fora desta
 * migracao — por isso versao nova em vez de editar a antiga.
 *
 * Nota de escopo: o mockup social-feed.html mostra um icone "verified" ao
 * lado do nome do autor e um botao de compartilhar. Nenhum dos dois tem
 * dado/endpoint real hoje (nao ha campo de verificacao alem de Pro/Team,
 * nem funcionalidade de compartilhamento) — em vez de omitir ou inventar,
 * os dois usam o padrao ObscuredCard (blur + cadeado).
 */
export function PostCard2({ post, badges, onPressAuthor, onToggleLike, onPressComments }: PostCard2Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleLikePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    onToggleLike();
  };

  return (
    <LiquiglassCard style={styles.card} padding={spacing2.md}>
      <Pressable style={styles.authorRow} onPress={onPressAuthor} hitSlop={4}>
        <Avatar initials={getInitials(post.author)} size={40} />
        <View style={styles.authorInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName}>{post.author}</Text>
            {post.visibility === 'followers' && (
              <Ionicons name="lock-closed" size={12} color={colors2.onSurfaceVariant} />
            )}
            <ObscuredCard style={styles.verifiedBadge} borderRadius={radius2.pill}>
              <Ionicons name="checkmark-circle" size={14} color={colors2.primary} />
            </ObscuredCard>
          </View>
          <View style={styles.metaRow}>
            {badges?.is_pro && <Badge label="Pro" variant="primary" />}
            {badges?.teams.map((team) => (
              <Text key={`${team.trainer_name}-${team.professional_type}`} style={styles.teamText} numberOfLines={1}>
                Team {team.trainer_name}
              </Text>
            ))}
            <Text style={styles.date}>{formatPostDate(post.created_at)}</Text>
          </View>
        </View>
      </Pressable>

      {!!post.caption && <Text style={styles.caption}>{post.caption}</Text>}

      {!!post.media_url && <Image source={{ uri: post.media_url }} style={styles.media} />}

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={handleLikePress} hitSlop={8}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons
              name={post.is_liked_by_me ? 'heart' : 'heart-outline'}
              size={22}
              color={post.is_liked_by_me ? colors2.violet : colors2.onSurfaceVariant}
            />
          </Animated.View>
          <Text style={[styles.actionCount, post.is_liked_by_me && styles.actionCountActive]}>
            {post.likes_count}
          </Text>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={onPressComments} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={20} color={colors2.onSurfaceVariant} />
          <Text style={styles.actionCount}>{post.comments_count}</Text>
        </Pressable>

        <ObscuredCard style={styles.shareBtn} borderRadius={radius2.sm}>
          <Ionicons name="share-outline" size={20} color={colors2.onSurfaceVariant} />
        </ObscuredCard>
      </View>
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  authorInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  authorName: { ...typography2.bodyMd, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs, flexWrap: 'wrap' },
  teamText: { ...typography2.labelCaps, fontSize: 10, textTransform: 'none', color: colors2.onSurfaceVariant },
  date: { ...typography2.labelCaps, fontSize: 10, textTransform: 'none', color: colors2.onSurfaceVariant, opacity: 0.7 },
  caption: { ...typography2.bodyMd },
  media: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: colors2.surfaceContainerHigh },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing2.lg,
    paddingTop: spacing2.sm,
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs },
  actionCount: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
  actionCountActive: { color: colors2.primary },

  verifiedBadge: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  shareBtn: { marginLeft: 'auto', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
