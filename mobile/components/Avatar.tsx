import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors2 } from '@/constants/theme';

/** Raio do canto proporcional ao tamanho (0.5 = circulo). Troque a forma do avatar do app inteiro AQUI. */
export const AVATAR_RADIUS_RATIO = 0.18;
export const avatarRadius = (size: number) => Math.max(4, Math.round(size * AVATAR_RADIUS_RATIO));

/** Ate este tamanho (px) a MINIATURA (256 px) basta; acima, a imagem grande (a miniatura ficaria borrada). */
const AVATAR_THUMB_MAX_SIZE = 64;

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
  /**
   * Miniatura 256x256 WebP (avatar_thumb_url). Com size <= 64 usa `thumbUrl ?? imageUrl`; com size > 64 usa
   * `imageUrl ?? thumbUrl`. Sem nenhuma das duas, mostra as iniciais. Avatares antigos nao tem miniatura (null):
   * caem na imagem grande.
   */
  thumbUrl?: string | null;
  /**
   * Sem efeito desde que o avatar e quadrado (a foto 1:1 cabe inteira em `cover`). Mantida so para nao quebrar
   * chamadas antigas; nenhuma chamada atual a passa.
   * @deprecated
   */
  fit?: boolean;
}

/**
 * Avatar quadrado (cantos arredondados por `avatarRadius`) com iniciais sobre gradiente roxo — usado em toda
 * parte onde haveria uma foto de usuario/profissional (o design novo nao usa fotos externas/realistas de
 * terceiros em lugar nenhum, ver regra "sem fotos externas"). Com `imageUrl` presente, mostra o avatar
 * estilizado gerado por IA no lugar do gradiente+iniciais (ver prop acima pra justificativa da excecao).
 */
export function Avatar({ initials, size = 40, style, imageUrl: imageUrlProp, thumbUrl }: AvatarProps) {
  const imageUrl = size <= AVATAR_THUMB_MAX_SIZE ? (thumbUrl ?? imageUrlProp) : (imageUrlProp ?? thumbUrl);
  const fontSize = Math.round(size * 0.4);
  const boxStyle: StyleProp<ViewStyle> = [
    styles.box,
    { width: size, height: size, borderRadius: avatarRadius(size) },
    style,
  ];

  if (imageUrl) {
    // Imagem quadrada (1024x1024; miniatura 256x256): num quadrado cabe inteira em "cover", sem corte e sem
    // camada borrada.
    return (
      <View style={boxStyle}>
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[colors2.violet, colors2.onPrimaryContainer]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={boxStyle}
    >
      <Text style={[styles.initials, { fontSize }]} numberOfLines={1}>
        {initials.slice(0, 2).toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  box: {
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
