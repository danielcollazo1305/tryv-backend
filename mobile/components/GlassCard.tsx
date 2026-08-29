import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { colors3, radius3, shadows3, spacing3 } from '@/constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * 'glass' = `.prism-glass` (secoes maiores — progresso, constancia,
   * exportar PDF, carrossel). 'card' = `.prism-glass-card` (tiles pequenos
   * — grid de metricas de saude): mais opaco (60% branco vs 40%), blur
   * mais raso (24 vs 32), sombra mais discreta.
   */
  variant?: 'glass' | 'card';
  padding?: number;
}

/**
 * Vidro fosco compartilhado do sistema visual novo "prism-glass" (ver
 * bloco colors3/theme3 em constants/theme.ts) — replica `.prism-glass` /
 * `.prism-glass-card` do HTML "TRYV - Dashboard":
 *   .prism-glass { background: rgba(255,255,255,.4); backdrop-filter: blur(32px);
 *     border: 1px solid rgba(255,255,255,.6); box-shadow: shadow-glass }
 *   .prism-glass-card { background: rgba(255,255,255,.6); backdrop-filter: blur(24px);
 *     border: 1px solid rgba(255,255,255,.8); box-shadow: shadow-glass (mais raso) }
 *
 * Componente NOVO e compartilhado (nao e um fork do LiquiglassCard.tsx
 * antigo) — outras telas vao reaproveitar isso quando migrarem pro tema
 * claro, por isso vive em constants/theme.ts + GlassCard.tsx em vez de
 * ficar embutido so na Home.
 *
 * Mesma separacao shadowWrapper/wrapper do LiquiglassCard.tsx: RN nao
 * mostra shadow* numa View que tambem tem overflow:'hidden' (o blur/corner
 * radius exige overflow:hidden na view de dentro).
 */
export function GlassCard({ children, style, variant = 'glass', padding }: GlassCardProps) {
  const isGlass = variant === 'glass';
  const resolvedPadding = padding ?? (isGlass ? spacing3.lg : spacing3.sm + 4);

  return (
    <View style={[styles.shadowWrapper, isGlass ? shadows3.glass : stylesCardShadow]}>
      <View style={[styles.wrapper, isGlass ? styles.glassWrapper : styles.cardWrapper]}>
        <BlurView intensity={isGlass ? 60 : 40} tint="light" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, isGlass ? styles.glassTint : styles.cardTint]} />
        {/*
          `style` do chamador vai aqui (no content, nao no shadowWrapper
          externo) — shadowWrapper so tem 1 filho (wrapper), entao um `gap`/
          flexDirection passado la nunca teria efeito nenhum sobre os
          filhos reais (children). Todo uso de `style` ate agora (gap entre
          secoes internas, flexDirection:'row' etc.) e sobre o layout
          INTERNO do card, entao e aqui que precisa entrar.
        */}
        <View style={[styles.content, { padding: resolvedPadding }, style]}>{children}</View>
      </View>
    </View>
  );
}

// Sombra do variant 'card' (tiles pequenos) — mais rasa que 'glass', sem
// entrar no objeto shadows3 (esse so tem as 2 sombras "de secao" do HTML,
// os tiles pequenos nao tem sombra propria explicita no CSS de origem —
// usa-se aqui uma aproximacao minima so pra dar leve elevacao).
const stylesCardShadow: ViewStyle = Platform.select({
  ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
  android: { elevation: 2 },
}) as ViewStyle;

const styles = StyleSheet.create({
  shadowWrapper: {
    borderRadius: radius3.xl,
  },
  wrapper: {
    borderRadius: radius3.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  glassWrapper: { borderColor: 'rgba(255, 255, 255, 0.6)' },
  cardWrapper: { borderColor: 'rgba(255, 255, 255, 0.8)' },
  glassTint: { backgroundColor: 'rgba(255, 255, 255, 0.4)' },
  cardTint: { backgroundColor: 'rgba(255, 255, 255, 0.6)' },
  content: {
    position: 'relative',
  },
});

export { colors3 };
