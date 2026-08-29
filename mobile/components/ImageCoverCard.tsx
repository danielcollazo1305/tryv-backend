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
 * da Home (Desafios sem desafio ativo, os 2 sub-cards de selecao de
 * profissional). Treino com IA / Acompanhamento profissional / Desafios
 * ativo migraram pro EditorialCard (carrossel "Para voce"), com o mesmo
 * gradiente corrigido abaixo.
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
      {/*
        3 paradas (claro no topo, escuro no rodape) em vez do preto liso
        0.3->0.65 de antes — causa raiz do bug "imagem some por completo"
        em fotos escuras de estudio (treino-ia-card.png/
        acompanhamento-profissional-card.png): um preto uniforme a 65%
        por cima de uma foto ja quase toda preta (silhueta + luz de
        borda) fica indistinguivel de "sem imagem nenhuma", mesmo com o
        require()/onLoad funcionando perfeitamente — confirmado abrindo os
        3 PNGs (Desafios tem ceu/luzes claras no fundo, os outros 2 sao
        quase 100% preto). O gradiente mais claro no topo deixa a foto
        aparecer sem perder a legibilidade do texto embaixo.
      */}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.08)', 'rgba(0, 0, 0, 0.42)', 'rgba(6, 6, 10, 0.85)']}
        locations={[0, 0.55, 1]}
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
