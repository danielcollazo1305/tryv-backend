import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { radius3, shadows3, spacing2, spacing3 } from '@/constants/theme';

interface LiquiglassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Padding interno — spacing2.lg (dark) ou spacing3.lg (light) por padrao, como a maioria dos cards nos designs. */
  padding?: number;
  /**
   * 'dark' (padrao, inalterado) = vidro escuro original (.liquiglass-card),
   * usado por todos os ~36 consumidores atuais, que nao passam essa prop.
   * 'light' = replica o comportamento do GlassCard.tsx (tema "prism-glass",
   * ver colors3/shadows3 em constants/theme.ts) em vez do gradiente escuro
   * — pra telas ja migradas pro claro que ainda dependem deste componente
   * (ex: activity/index.tsx via HealthSummaryCard). Reaproveita os mesmos
   * tokens/valores do GlassCard em vez de reinventar, pra ficarem
   * visualmente equivalentes.
   */
  variant?: 'dark' | 'light';
}

// 1.5rem do CSS real (config-meta-calorica.html) = 24px. Hardcoded aqui em
// vez de radius2.lg (=20) pra nao alterar esse token compartilhado e afetar
// outros componentes que o usam por outros motivos. So vale pro variant
// 'dark' -- 'light' usa radius3.xl, o mesmo raio do GlassCard.
const CARD_RADIUS = 24;

// Sombra do variant 'dark' -- extraida do antigo shadowWrapper estatico
// (era um spread direto no StyleSheet.create) pra virar condicional por
// variant, igual o shadows3.glass do variant 'light'. Valor identico ao
// original, sem mudanca visual pros consumidores existentes.
const darkShadow: ViewStyle = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 },
  android: { elevation: 10 },
}) as ViewStyle;

/**
 * Replica .liquiglass-card do CSS real dos mockups aprovados (confirmado
 * lendo config-meta-calorica.html, nao estimado):
 *   background: linear-gradient(135deg, rgba(30,30,30,0.7) 0%, rgba(18,18,18,0.8) 100%);
 *   backdrop-filter: blur(16px);
 *   border: 1px solid rgba(139, 92, 246, 0.2);
 *   box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.5);
 *   border-radius: 1.5rem;
 *
 * Two-view split (shadowWrapper > wrapper) e necessario porque RN nao
 * consegue mostrar shadow* numa View que tambem tem overflow:'hidden' — o
 * clip do overflow corta a sombra junto. shadowWrapper carrega a sombra
 * (sem overflow), wrapper (dentro) carrega overflow:hidden + borda +
 * borderRadius pra recortar o BlurView/gradiente nos cantos arredondados.
 *
 * Aproximacoes que precisam de validacao visual no device (nao da pra
 * confirmar so lendo codigo):
 * - RN nao tem box-shadow inset — o brilho superior do vidro (inset 0 1px
 *   0 rgba(255,255,255,0.1)) foi aproximado com borderTopColor diferente
 *   do borderColor geral, no lugar de uma inset shadow de verdade.
 * - A sombra de elevacao (0 8px 32px rgba(0,0,0,0.5)) só usa as props
 *   shadow-x (rgba de verdade) no iOS; Android usa `elevation`, que nao aceita
 *   raio/opacidade customizados — o valor 10 foi um chute pra ficar
 *   visualmente parecido, sem como validar sem rodar no device (mesma
 *   limitacao ja documentada no Button2 pro glow roxo).
 */
export function LiquiglassCard({ children, style, padding, variant = 'dark' }: LiquiglassCardProps) {
  const isLight = variant === 'light';
  const resolvedPadding = padding ?? (isLight ? spacing3.lg : spacing2.lg);

  return (
    <View
      style={[isLight ? stylesLight.shadowWrapper : styles.shadowWrapper, isLight ? shadows3.glass : darkShadow, style]}
    >
      <View style={isLight ? stylesLight.wrapper : styles.wrapper}>
        <BlurView intensity={isLight ? 60 : 40} tint={isLight ? 'light' : 'dark'} style={StyleSheet.absoluteFillObject} />
        {isLight ? (
          <View style={[StyleSheet.absoluteFillObject, stylesLight.tint]} />
        ) : (
          <LinearGradient
            colors={['rgba(30, 30, 30, 0.7)', 'rgba(18, 18, 18, 0.8)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        <View style={[styles.content, { padding: resolvedPadding }]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    borderRadius: CARD_RADIUS,
  },
  wrapper: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    position: 'relative',
  },
});

// Variant 'light' -- mesmos valores de GlassCard.tsx variant="glass"
// (radius3.xl, shadows3.glass, blur intensity 60/tint light, tinte branco
// 40% translucido, borda branca 60%), pra ficar visualmente equivalente.
const stylesLight = StyleSheet.create({
  shadowWrapper: {
    borderRadius: radius3.xl,
  },
  wrapper: {
    borderRadius: radius3.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  tint: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
});
