import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { RetroText } from '@/components/retro/RetroText';
import { RETRO } from '@/components/retro/retroTheme';

interface RetroBarProps {
  label: string;
  /** Variante destacada: barra mais clara e rotulo escuro. */
  highlighted?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Barra de cabecalho/comando: rotulo pixel sobre uma barra roxa em degrade (#3b1d7a -> #b9a4ff -> #3b1d7a).
 * Com `onPress` vira botao (alvo minimo de 44 pt).
 */
export function RetroBar({ label, highlighted, onPress, disabled, accessibilityLabel, style }: RetroBarProps) {
  const content = (
    <View style={styles.inner}>
      <LinearGradient
        colors={[RETRO.accentDark, RETRO.accent, RETRO.accentDark]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, highlighted ? styles.gradientOn : styles.gradientOff]}
      />
      <RetroText size={9} color={highlighted ? '#07060c' : RETRO.text} numberOfLines={1} style={styles.label}>
        {label}
      </RetroText>
    </View>
  );

  if (!onPress) return <View style={[styles.wrap, style]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.wrap, styles.touch, disabled && styles.disabled, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 28 },
  touch: { minHeight: 44, justifyContent: 'center' },
  inner: {
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: RETRO.border,
    overflow: 'hidden',
  },
  gradientOn: { opacity: 1 },
  gradientOff: { opacity: 0.55 },
  label: { textAlign: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
});
