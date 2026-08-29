import React from 'react';
import { Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Post } from '@/services/social';
import { colors2, colors3, spacing2, spacing3 } from '@/constants/theme';

const GRID_GAP = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE_DARK = (SCREEN_WIDTH - spacing2.containerMargin * 2 - GRID_GAP * 2) / 3;
const ITEM_SIZE_LIGHT = (SCREEN_WIDTH - spacing3.containerMargin * 2 - GRID_GAP * 2) / 3;

interface PostGrid2Props {
  posts: Post[];
  /**
   * 'dark' (padrao) = colors2/liquiglass, usado hoje em social/[userId].tsx.
   * 'light' = colors3/prism-glass, so pro Perfil proprio (ja migrado) —
   * mesmo padrao de variant ja usado em EmptyFollowingState/ObscuredCard/
   * TextField2/ProfileBadges2 nesta sessao, pra nao afetar o outro uso.
   */
  variant?: 'dark' | 'light';
}

/**
 * Equivalente do PostGrid.tsx pro design novo — mesma API (posts). PostGrid
 * original continua em uso em (tabs)/profile.tsx, fora desta migracao —
 * por isso versao nova em vez de editar a antiga.
 */
export function PostGrid2({ posts, variant = 'dark' }: PostGrid2Props) {
  const isLight = variant === 'light';
  const itemSize = isLight ? ITEM_SIZE_LIGHT : ITEM_SIZE_DARK;

  return (
    <View style={styles.grid}>
      {posts.map((post) => (
        <Pressable
          key={post.id}
          style={[styles.item, { width: itemSize, height: itemSize, backgroundColor: isLight ? colors3.surfaceContainerHigh : colors2.surfaceContainerHigh }]}
          onPress={() => router.push({ pathname: '/social/post/[postId]', params: { postId: post.id } })}
        >
          {post.media_url ? (
            <Image source={{ uri: post.media_url }} style={styles.image} />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={isLight ? colors3.onSurfaceVariant : colors2.onSurfaceVariant}
              />
            </View>
          )}
          {post.visibility === 'followers' && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={10} color={isLight ? colors3.white : colors2.white} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  item: {},
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 3,
  },
});
