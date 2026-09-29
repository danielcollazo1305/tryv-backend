import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors2, radius2 } from '@/constants/theme';

interface AvatarProps {
  /** Ja deve vir calculado (ex: nome do usuario -> iniciais) — o componente nao extrai iniciais sozinho. */
  initials: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * URL do avatar estilizado gerado por IA (POST /users/me/avatar,
   * User.avatar_url) -- unica excecao a regra "sem fotos externas" (nao e
   * uma foto realista de terceiro, e um retrato estilizado opt-in do
   * proprio usuario). Ausente/null (o padrao, nenhum dos ~30 consumidores
   * atuais passa essa prop): comportamento identico a antes desta mudanca.
   */
  imageUrl?: string | null;
}

/**
 * Avatar com iniciais sobre gradiente roxo — usado em toda parte onde
 * haveria uma foto de usuario/profissional (o design novo nao usa fotos
 * externas/realistas de terceiros em lugar nenhum, ver regra "sem fotos
 * externas"). Com `imageUrl` presente, mostra o avatar estilizado gerado
 * por IA no lugar do gradiente+iniciais (ver prop acima pra justificativa
 * da excecao).
 */
export function Avatar({ initials, size = 40, style, imageUrl }: AvatarProps) {
  const fontSize = Math.round(size * 0.4);
  const circleStyle: StyleProp<ViewStyle> = [
    styles.circle,
    { width: size, height: size, borderRadius: radius2.pill },
    style,
  ];

  if (imageUrl) {
    return (
      <View style={circleStyle}>
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[colors2.violet, colors2.onPrimaryContainer]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={circleStyle}
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: colors2.white,
    fontWeight: '700',
  },
});
