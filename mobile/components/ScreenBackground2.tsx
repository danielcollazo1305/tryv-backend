import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors2 } from '@/constants/theme';

interface ScreenBackground2Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fundo compartilhado por toda tela que usa LiquiglassCard (direto ou via
 * componente filho — PostCard2, WorkoutDayCard, MealCard, etc.). Replica o
 * wash radial roxo do `body` dos mockups aprovados, confirmado lendo o CSS
 * real de config-meta-calorica.html (nao estimado):
 *
 *   background-image:
 *     radial-gradient(circle at 15% 50%, rgba(139, 92, 246, 0.05) 0%, transparent 50%),
 *     radial-gradient(circle at 85% 30%, rgba(168, 85, 247, 0.05) 0%, transparent 50%);
 *
 * react-native-svg ja e dependencia do projeto (usado em ReadinessCard,
 * trainers/live/[id].tsx) e exporta RadialGradient — usado aqui pra
 * fidelidade real ao radial-gradient do CSS, sem precisar aproximar com
 * LinearGradient/blobs (essa era a abordagem da tentativa anterior, agora
 * descartada).
 *
 * Nuance que precisa de validacao visual no device: o "50%" do CSS, num
 * radial-gradient circle sem tamanho explicito, e resolvido pelo browser
 * com base no tamanho da own do elemento (bounding box). O `r="50%"` do
 * RadialGradient do SVG (com gradientUnits padrao objectBoundingBox) e a
 * traducao mais literal disso, mas os dois motores de gradiente (CSS do
 * browser vs. SVG do RN) podem interpretar o raio de forma sutilmente
 * diferente — o resultado pode ficar mais concentrado ou mais espalhado
 * do que no mockup original.
 *
 * Mantém colors2.background (#131313) como base em vez do #0e0e0e do
 * mockup especifico — trocar o tom base afetaria toda tela do app, fora do
 * escopo deste ajuste (que e sobre reproduzir a textura, nao mudar a
 * paleta base).
 */
export function ScreenBackground2({ children, style }: ScreenBackground2Props) {
  return (
    <View style={[styles.container, style]}>
      <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Defs>
          <RadialGradient id="glowViolet" cx="15%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="rgb(139, 92, 246)" stopOpacity={0.05} />
            <Stop offset="100%" stopColor="rgb(139, 92, 246)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowPurple" cx="85%" cy="30%" r="50%">
            <Stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity={0.05} />
            <Stop offset="100%" stopColor="rgb(168, 85, 247)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowViolet)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowPurple)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors2.background },
});
