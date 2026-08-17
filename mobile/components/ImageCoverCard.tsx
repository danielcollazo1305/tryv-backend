import React from 'react';
import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors2, spacing2, typography2 } from '@/constants/theme';

// Mesmo raio de LiquiglassCard.tsx (24, nao radius2.lg=20) — pra ficar
// visualmente consistente com os cards liquiglass vizinhos na Home, que
// usam esse valor hardcoded pelo mesmo motivo (fidelidade ao CSS real dos
// mockups, ver comentario em LiquiglassCard.tsx).
const CARD_RADIUS = 24;

interface ImageCoverCardProps {
  image: ImageSourcePropType;
  title: string;
  subtitle?: string;
  accessibilityLabel: string;
  onPress: () => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Card com imagem de fundo + gradiente escuro (legibilidade de texto por
 * cima) + cantos arredondados — padrao reutilizado pelos cards com imagem
 * da Home (Desafios, Treino com IA, Acompanhamento profissional e os 2
 * sub-cards de selecao de profissional), em vez de repetir a mesma
 * combinacao Image+LinearGradient+overflow em cada lugar separadamente.
 */
export function ImageCoverCard({
  image,
  title,
  subtitle,
  accessibilityLabel,
  onPress,
  height = 140,
  style,
}: ImageCoverCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrapper, { height }, style]}
    >
      <Image source={image} style={StyleSheet.absoluteFillObject} resizeMode="cover" accessibilityIgnoresInvertColors />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.65)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: colors2.surfaceContainerHigh,
  },
  textWrap: { padding: spacing2.md },
  title: { ...typography2.headlineMd, fontSize: 18, color: colors2.white },
  subtitle: { ...typography2.bodyMd, fontSize: 13, color: 'rgba(255, 255, 255, 0.85)', marginTop: 2 },
});
