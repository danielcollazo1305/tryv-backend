import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing2 } from '@/constants/theme';

interface LiquiglassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Padding interno — spacing2.lg por padrao, como a maioria dos cards nos designs. */
  padding?: number;
}

// 1.5rem do CSS real (config-meta-calorica.html) = 24px. Hardcoded aqui em
// vez de radius2.lg (=20) pra nao alterar esse token compartilhado e afetar
// outros componentes que o usam por outros motivos.
const CARD_RADIUS = 24;

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
export function LiquiglassCard({ children, style, padding = spacing2.lg }: LiquiglassCardProps) {
  return (
    <View style={[styles.shadowWrapper, style]}>
      <View style={styles.wrapper}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient
          colors={['rgba(30, 30, 30, 0.7)', 'rgba(18, 18, 18, 0.8)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.content, { padding }]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    borderRadius: CARD_RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
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
