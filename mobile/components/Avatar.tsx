import React from 'react';
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors2, radius2 } from '@/constants/theme';

interface AvatarProps {
  /** Ja deve vir calculado (ex: nome do usuario -> iniciais) — o componente nao extrai iniciais sozinho. */
  initials: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Avatar com iniciais sobre gradiente roxo — usado em toda parte onde
 * haveria uma foto de usuario/profissional (o design novo nao usa fotos
 * realistas em lugar nenhum, ver regra "sem fotos externas").
 */
export function Avatar({ initials, size = 40, style }: AvatarProps) {
  const fontSize = Math.round(size * 0.4);

  return (
    <LinearGradient
      colors={[colors2.violet, colors2.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: radius2.pill },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize }]} numberOfLines={1}>
        {initials.slice(0, 2).toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors2.white,
    fontWeight: '700',
  },
});
