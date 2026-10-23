import React, { useState } from 'react';
import { FlatList, Image, ImageStyle, NativeScrollEvent, NativeSyntheticEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { carouselCounterText, pageIndexFromOffset } from '@/services/postPhotosState';

interface PostPhotoCarouselProps {
  /** Fotos do post em ordem (use photosOfPost). Vazio = nao desenha nada. */
  urls: string[];
  /** Mesmo estilo que o card ja usava para a foto unica (largura total, proporcao, cantos, fundo). */
  style: StyleProp<ViewStyle>;
}

/**
 * Fotos de um post. Com 1 foto desenha so a imagem, exatamente como antes. Com 2 ou mais: lista horizontal paginada (uma foto por
 * pagina), contador "N/M" no canto e pontos embaixo. Nao muda o que acontece ao tocar (hoje a foto nao tem acao).
 * Acessibilidade: cada foto e anunciada como "Foto 2 de 5". Sem biblioteca nova (FlatList do React Native).
 */
export function PostPhotoCarousel({ urls, style }: PostPhotoCarouselProps) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return <Image source={{ uri: urls[0] }} style={style as StyleProp<ImageStyle>} accessibilityLabel="Foto do post" />;
  }

  const total = urls.length;
  const counter = carouselCounterText(index, total);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(pageIndexFromOffset(event.nativeEvent.contentOffset.x, width, total));
  };

  return (
    <View
      style={[style, styles.wrap]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel={`Fotos do post, ${total} fotos`}
    >
      {width > 0 && (
        <FlatList
          data={urls}
          keyExtractor={(url, i) => `${i}-${url}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialNumToRender={2}
          windowSize={3}
          renderItem={({ item, index: i }) => (
            <Image
              source={{ uri: item }}
              style={{ width, height: '100%' }}
              accessibilityLabel={`Foto ${i + 1} de ${total}`}
              resizeMode="cover"
            />
          )}
        />
      )}
      {!!counter && (
        <View style={styles.counter} pointerEvents="none">
          <Text style={styles.counterText} accessibilityLabel={`Foto ${index + 1} de ${total}`}>
            {counter}
          </Text>
        </View>
      )}
      <View style={styles.dots} pointerEvents="none">
        {urls.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  counter: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  counterText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  dots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#FFFFFF' },
});
