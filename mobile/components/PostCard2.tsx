import React, { useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/Avatar';
import { GlassCard } from '@/components/GlassCard';
import { ObscuredCard } from '@/components/ObscuredCard';
import { Post, formatPostDate } from '@/services/social';
import { UserBadges } from '@/services/user';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
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
 * Migrado pro tema claro "prism-glass" nesta tarefa (LiquiglassCard ->
 * GlassCard, colors2 -> colors3) — este componente e usado SO pelo Feed
 * (confirmado: nenhuma outra tela importa PostCard2), entao a migracao
 * total e segura, sem risco de vazar pra tela ainda escura nenhuma. O
 * badge "PRO"/"TEAM" NAO usa o componente compartilhado Badge.tsx (que e
 * usado por varias telas ainda escuras) — replicado localmente com cores
 * claras pra nao arriscar mudar o Badge em lugar nenhum fora daqui.
 * ObscuredCard ganhou uma prop `tint="light"` nova (default 'dark'
 * inalterado em todo o resto do app) especificamente pra isso.
 *
 * Nota de escopo (ja documentada antes, ainda vale): o mockup
 * social-feed.html mostra um icone "verified" e um botao de compartilhar
 * sem dado/endpoint real hoje — continuam usando ObscuredCard (blur +
 * cadeado), agora so com tint claro.
 *
 * Nota de escopo NOVA (mockup Tryv Feed.dc.html): o frame de referencia do
 * mockup mostra um "conteudo de post estruturado" (icone + titulo + stats,
 * tipo "Corrida matinal · 8,2 km · 42 min"), mas o proprio mockup marca
 * esse frame como "nao parte do pedido, so referencia" — e o tipo `Post`
 * real (services/social.ts) so tem caption/media_url genericos, sem campo
 * de tipo de atividade/titulo/stats estruturado nenhum. Implementar aquele
 * visual exigiria inventar dado que nao existe, contra a regra de sempre
 * ("nao inventar dado") — mantida a estrutura real (caption + imagem
 * opcional), so recolorida.
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
    <GlassCard variant="glass" style={styles.card}>
      <Pressable style={styles.authorRow} onPress={onPressAuthor} hitSlop={4}>
        <Avatar initials={getInitials(post.author)} size={40} />
        <View style={styles.authorInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName}>{post.author}</Text>
            {post.visibility === 'followers' && (
              <Ionicons name="lock-closed" size={12} color={colors3.onSurfaceVariant} />
            )}
            <ObscuredCard style={styles.verifiedBadge} borderRadius={radius3.pill} tint="light">
              <Ionicons name="checkmark-circle" size={14} color={colors3.primary} />
            </ObscuredCard>
          </View>
          <View style={styles.metaRow}>
            {badges?.is_pro && (
              <View style={[styles.badgePill, styles.badgePillPrimary]}>
                <Text style={[styles.badgeText, styles.badgeTextPrimary]}>PRO</Text>
              </View>
            )}
            {badges?.teams.map((team) => (
              <View key={`${team.trainer_name}-${team.professional_type}`} style={styles.badgePill}>
                <Text style={styles.badgeText} numberOfLines={1}>
                  TEAM {team.trainer_name.toUpperCase()}
                </Text>
              </View>
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
              color={post.is_liked_by_me ? colors3.primary : colors3.onSurfaceVariant}
            />
          </Animated.View>
          <Text style={[styles.actionCount, post.is_liked_by_me && styles.actionCountActive]}>
            {post.likes_count}
          </Text>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={onPressComments} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={20} color={colors3.onSurfaceVariant} />
          <Text style={styles.actionCount}>{post.comments_count}</Text>
        </Pressable>

        <ObscuredCard style={styles.shareBtn} borderRadius={radius3.sm} tint="light">
          <Ionicons name="share-outline" size={20} color={colors3.onSurfaceVariant} />
        </ObscuredCard>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.md },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  authorInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  authorName: { ...typography3.bodyMd, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs, flexWrap: 'wrap' },

  // Badge "PRO"/"TEAM" local (nao o componente compartilhado Badge.tsx,
  // usado por telas ainda escuras) — mesmas cores do mockup aprovado.
  badgePill: {
    borderRadius: radius3.pill,
    paddingHorizontal: spacing3.xs + 2,
    paddingVertical: 3,
    backgroundColor: 'rgba(107, 56, 212, 0.11)',
  },
  badgePillPrimary: { backgroundColor: 'rgba(107, 56, 212, 0.11)' },
  badgeText: { ...typography3.labelSm, fontSize: 9, letterSpacing: 0.8, color: '#4c1fa8', fontWeight: '700' },
  badgeTextPrimary: { color: '#4c1fa8' },

  date: { ...typography3.labelSm, fontSize: 10, color: colors3.onSurfaceVariant, opacity: 0.8 },
  caption: { ...typography3.bodyMd },
  media: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: colors3.surfaceVariant },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing3.lg,
    paddingTop: spacing3.sm,
    borderTopWidth: 1,
    borderTopColor: colors3.outlineVariant,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  actionCount: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
  actionCountActive: { color: colors3.primary },

  verifiedBadge: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  shareBtn: { marginLeft: 'auto', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
