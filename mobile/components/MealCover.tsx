import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { MealCoverArt } from '@/components/MealCoverArt';
import { coverSource } from '@/constants/mealCovers';
import { colors3 } from '@/constants/theme';
import type { MealCoverName } from '@/utils/mealCoverPick';

// Onde fica o prato nas imagens (800x800): centro em ~50% da largura e ~48% da altura. A faixa livre de baixo e de ~21% da altura.
const PLATE_CENTER_X = 0.5;
const PLATE_CENTER_Y = 0.48;
const FADE_HEIGHT = 0.2;

interface MealCoverProps {
  /** Nome da capa (de pickMealCover/dayCoverFor). null/ausente do mapa = prato roxo (MealCoverArt). */
  cover: MealCoverName | null;
  /** Lado do quadrado em pt. */
  size: number;
  /**
   * Recorte para cartoes pequenos: >1 aproxima do prato (centrado em x 50%, y 48%) em vez de mostrar a imagem inteira. 1 = imagem inteira.
   * Padrao 1.5 abaixo de 80 pt, 1 acima.
   */
  zoom?: number;
  /** Fade na cor `fadeColor` so nos ULTIMOS 20% da altura (a faixa livre), para texto sobre a capa sem cobrir o prato. */
  fade?: boolean;
  fadeColor?: string;
  /** Versao esmaecida (dia sem refeicao), igual ao MealCoverArt. */
  faded?: boolean;
  /** Se informado, a capa e lida por leitor de tela; sem ele e decorativa. */
  accessibilityLabel?: string;
  /** Raio do canto do recorte. */
  borderRadius?: number;
}

export function MealCover({ cover, size, zoom, fade = false, fadeColor = colors3.surface, faded = false, accessibilityLabel, borderRadius = 0 }: MealCoverProps) {
  const source = coverSource(cover);
  if (!source) return <MealCoverArt size={size} faded={faded} accessibilityLabel={accessibilityLabel} />;

  const z = Math.max(1, zoom ?? (size < 80 ? 1.5 : 1));
  const full = size * z;
  const decorative = !accessibilityLabel;
  return (
    <View
      style={[styles.box, { width: size, height: size, borderRadius, opacity: faded ? 0.4 : 1 }]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      <Image
        source={source}
        resizeMode="cover"
        style={{
          position: 'absolute',
          width: full,
          height: full,
          // desloca para o prato ficar no centro do quadrado, sem deixar borda vazia (limitado a [size - full, 0]; com z=1 e a imagem inteira)
          left: Math.min(0, Math.max(size - full, size / 2 - full * PLATE_CENTER_X)),
          top: Math.min(0, Math.max(size - full, size / 2 - full * PLATE_CENTER_Y)),
        }}
      />
      {fade && z === 1 && (
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(fadeColor, 0), fadeColor]}
          style={[styles.fade, { height: size * FADE_HEIGHT }]}
        />
      )}
    </View>
  );
}

/** '#rrggbb' -> 'rgba(r,g,b,a)' (gradiente de/para transparente na mesma cor, sem o cinza que 'transparent' deixa no meio). */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return alpha === 0 ? 'rgba(255,255,255,0)' : hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
