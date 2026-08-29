import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

export type GlowPosition = 'top-left' | 'top-center' | 'top-right';

const GLOW_CX: Record<GlowPosition, string> = {
  'top-left': '18%',
  'top-center': '50%',
  'top-right': '82%',
};

interface RadialGlowProps {
  position?: GlowPosition;
  color: string;
  /** cy do centro do glow, em % — 2 por padrao (bem perto do topo). */
  cy?: string;
  /** raio do glow, em % — 60 por padrao. */
  radius?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fonte de luz radial (glow) — React Native nao tem radial-gradient
 * nativo, entao usa react-native-svg (ja e dependencia do projeto) em vez
 * de aproximar com blur/sombra. Usado pelo glow decorativo discreto do
 * ActivityProgressCard.tsx (`bg-primary/10 blur-3xl` no HTML "TRYV -
 * Dashboard").
 */
export function RadialGlow({ position = 'top-right', color, cy = '2%', radius = '60%', opacity = 0.55, style }: RadialGlowProps) {
  return (
    <Svg style={[StyleSheet.absoluteFillObject, style]} width="100%" height="100%">
      <Defs>
        <RadialGradient id="glow" cx={GLOW_CX[position]} cy={cy} r={radius}>
          <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  );
}
