import React from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';

import { RETRO } from '@/components/retro/retroTheme';

interface RetroSlotProps {
  source: ImageSourcePropType;
  /** Lado do quadrado em pt (calculado pela largura da tela). */
  size: number;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
}

/**
 * Slot de item: borda de 2 px (#2a1f4a); selecionado ganha moldura dupla roxa (#b9a4ff) com brilho.
 * Imagem com fundo preto puro e resizeMode contain.
 */
export function RetroSlot({ source, size, selected, onPress, accessibilityLabel }: RetroSlotProps) {
  const inner = size - (selected ? 12 : 8);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      style={[styles.outer, { width: size, height: size }, selected && styles.outerSelected]}
    >
      <View style={[styles.frame, selected ? styles.frameSelected : styles.frameIdle, { width: size - (selected ? 6 : 0), height: size - (selected ? 6 : 0) }]}>
        <Image source={source} resizeMode="contain" style={{ width: inner, height: inner, opacity: selected ? 1 : 0.55 }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  outerSelected: {
    borderWidth: 2,
    borderColor: RETRO.accent,
    shadowColor: RETRO.accent,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  frame: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderWidth: 2 },
  frameIdle: { borderColor: RETRO.slotBorder },
  frameSelected: { borderColor: RETRO.accent },
});
