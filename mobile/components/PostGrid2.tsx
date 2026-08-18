import React from 'react';
import { Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Post } from '@/services/social';
import { colors2, spacing2 } from '@/constants/theme';

const GRID_GAP = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - spacing2.containerMargin * 2 - GRID_GAP * 2) / 3;

/**
 * Equivalente do PostGrid.tsx pro design novo — mesma API (posts). PostGrid
 * original continua em uso em (tabs)/profile.tsx, fora desta migracao —
 * por isso versao nova em vez de editar a antiga.
 */
export function PostGrid2({ posts }: { posts: Post[] }) {
  return (
    <View style={styles.grid}>
      {posts.map((post) => (
        <Pressable
          key={post.id}
          style={styles.item}
          onPress={() => router.push({ pathname: '/social/post/[postId]', params: { postId: post.id } })}
        >
          {post.media_url ? (
            <Image source={{ uri: post.media_url }} style={styles.image} />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="document-text-outline" size={20} color={colors2.onSurfaceVariant} />
            </View>
          )}
          {post.visibility === 'followers' && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={10} color={colors2.white} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: colors2.surfaceContainerHigh,
  },
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
