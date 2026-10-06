import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors2, colors3, radius2 } from '@/constants/theme';

// Enquadramento do avatar estilizado (imagem quadrada 1024x1024, cabeca e ombros, fundo de cor lisa)
// dentro do circulo: o circulo so aproveita ~78% da area de um quadrado, entao um "cover" puro corta
// ombros e topo do cabelo. Solucao: a foto INTEIRA, um pouco menor, sobre uma copia BORRADA da mesma
// imagem que preenche o resto do circulo. Ajuste os numeros AQUI.
/** Escala da foto nitida (frente) dentro do circulo. Menor = mais da imagem visivel, mais fundo borrado. */
export const AVATAR_PHOTO_SCALE = 0.86;
/** Escala da copia borrada (fundo): >1 pra garantir que nenhuma borda transparente do blur apareca. */
export const AVATAR_BACKDROP_SCALE = 1.35;
/** blurRadius do fundo = size * fator, com teto (blur grande so custa mais, nao melhora o visual). */
const AVATAR_BLUR_FACTOR = 0.25;
const AVATAR_BLUR_MAX = 24;
/** Ate este tamanho (px) o blur nao vale o custo (listas longas): so a camada nitida, escala maior. */
const AVATAR_BLUR_MIN_SIZE = 28;
const AVATAR_SMALL_PHOTO_SCALE = 0.9;

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
   * Com `imageUrl`: true (padrao) = foto inteira um pouco menor sobre uma copia borrada dela mesma
   * (ver AVATAR_PHOTO_SCALE); false = comportamento antigo (uma imagem cover, que corta os cantos).
   * Sem `imageUrl` (iniciais + gradiente) nao muda nada.
   */
  fit?: boolean;
}

/**
 * Avatar com iniciais sobre gradiente roxo — usado em toda parte onde
 * haveria uma foto de usuario/profissional (o design novo nao usa fotos
 * externas/realistas de terceiros em lugar nenhum, ver regra "sem fotos
 * externas"). Com `imageUrl` presente, mostra o avatar estilizado gerado
 * por IA no lugar do gradiente+iniciais (ver prop acima pra justificativa
 * da excecao).
 */
export function Avatar({ initials, size = 40, style, imageUrl, fit = true }: AvatarProps) {
  const fontSize = Math.round(size * 0.4);
  const circleStyle: StyleProp<ViewStyle> = [
    styles.circle,
    { width: size, height: size, borderRadius: radius2.pill },
    style,
  ];

  if (imageUrl) {
    // As duas camadas usam a MESMA uri: o RN Image resolve pelo cache do sistema, entao a imagem e
    // baixada/decodificada uma vez so (nenhuma politica de cache/prioridade extra e definida -- o
    // Image do RN nao expoe prioridade e forcar cache serviria avatar velho se a URL se repetir).
    if (!fit) {
      return (
        <View style={circleStyle}>
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        </View>
      );
    }

    // Pequeno demais pra valer um blur (ex: linhas de lista): so a camada nitida, um pouco menor, com
    // um fundo neutro preenchendo a folga (nos 4 pontos cardeais do circulo a foto reduzida nao chega).
    if (size <= AVATAR_BLUR_MIN_SIZE) {
      return (
        <View style={[circleStyle, styles.smallBackdrop]}>
          <Image
            source={{ uri: imageUrl }}
            style={[styles.layer, { transform: [{ scale: AVATAR_SMALL_PHOTO_SCALE }] }]}
            resizeMode="cover"
          />
        </View>
      );
    }

    return (
      <View style={circleStyle}>
        {/* Fundo: a mesma imagem em tela cheia, borrada e ampliada (cobre qualquer borda do blur). */}
        <Image
          source={{ uri: imageUrl }}
          style={[styles.layer, { transform: [{ scale: AVATAR_BACKDROP_SCALE }] }]}
          resizeMode="cover"
          blurRadius={Math.min(Math.round(size * AVATAR_BLUR_FACTOR), AVATAR_BLUR_MAX)}
        />
        {/* Frente: a foto nitida inteira, reduzida, centralizada (o container nao muda de tamanho). */}
        <Image
          source={{ uri: imageUrl }}
          style={[styles.layer, { transform: [{ scale: AVATAR_PHOTO_SCALE }] }]}
          resizeMode="cover"
        />
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
  // Camada do enquadramento: ocupa o circulo inteiro (as duas camadas ficam empilhadas) e o
  // transform: scale encolhe/amplia em torno do centro, sem mexer no tamanho do container.
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  smallBackdrop: {
    backgroundColor: colors3.surfaceContainerHigh,
  },
  initials: {
    color: colors2.white,
    fontWeight: '700',
  },
});
