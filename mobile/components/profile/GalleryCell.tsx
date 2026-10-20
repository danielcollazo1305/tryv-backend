import React from 'react';
import { Dimensions, Image, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { colors3, spacing3 } from '@/constants/theme';
import { GalleryItem } from '@/services/profileFeedState';

export const GALLERY_COLUMNS = 3;
export const GALLERY_GAP = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
/** Mesma conta do PostGrid2 (tela de perfil/Social): 3 colunas, margem da tela dos dois lados e 2 px entre as fotos. */
export const GALLERY_CELL_SIZE = (SCREEN_WIDTH - spacing3.containerMargin * 2 - GALLERY_GAP * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS;

/** Uma foto da galeria (grade de 3 colunas). Toca para o post que ja existe (/social/post/[postId]), o mesmo da grade de posts. */
export function GalleryCell({ item }: { item: GalleryItem }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/social/post/[postId]', params: { postId: item.post_id } })}
      accessibilityRole="imagebutton"
      accessibilityLabel="Abrir o post desta foto"
      style={styles.cell}
    >
      <Image source={{ uri: item.url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { width: GALLERY_CELL_SIZE, height: GALLERY_CELL_SIZE, marginRight: GALLERY_GAP, marginBottom: GALLERY_GAP, backgroundColor: colors3.surfaceContainerHigh },
  image: { width: '100%', height: '100%' },
});
