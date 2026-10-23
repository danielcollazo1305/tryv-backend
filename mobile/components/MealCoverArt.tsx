import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors3 } from '@/constants/theme';

/** Tipos de refeicao para uma versao colorida FUTURA (o app ainda nao guarda o tipo da refeicao: nada usa isso hoje). */
export type MealTone = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealCoverVariant = 'purple' | 'byMeal';

interface Palette {
  rim: string;
  plate: string;
  ring: string;
  line: string;
  shine: string;
}

// Tres tons do roxo da marca, todos tirados do tema (colors3): borda do prato, fundo claro, aro interno e talher.
const PURPLE: Palette = {
  rim: colors3.primaryContainer,
  plate: colors3.primaryFixed,
  ring: colors3.primaryFixedDim,
  line: colors3.primary,
  shine: colors3.surfaceContainerLowest,
};

// Versao por tipo de refeicao (so entra se variant="byMeal" E tone for informado; hoje ninguem liga isso).
const BY_MEAL: Record<MealTone, Palette> = {
  breakfast: { ...PURPLE, rim: colors3.tertiaryContainer, plate: colors3.tertiaryFixed, ring: colors3.tertiaryFixedDim, line: colors3.tertiary },
  lunch: { ...PURPLE, rim: colors3.secondary, plate: colors3.secondaryFixed, ring: colors3.secondaryFixedDim, line: colors3.secondary },
  dinner: PURPLE,
  snack: { ...PURPLE, rim: colors3.inversePrimary, plate: colors3.primaryFixed, ring: colors3.primaryFixedDim, line: colors3.surfaceTint },
};

export function paletteFor(variant: MealCoverVariant = 'purple', tone?: MealTone): Palette {
  return variant === 'byMeal' && tone ? BY_MEAL[tone] : PURPLE;
}

interface MealCoverArtProps {
  /** Lado do quadrado em pt. */
  size?: number;
  /** 'purple' (padrao) = tudo no roxo da marca; 'byMeal' + `tone` = uma cor por tipo de refeicao (ainda nao ligado em nenhuma tela). */
  variant?: MealCoverVariant;
  tone?: MealTone;
  /** Versao esmaecida para "nada registrado" (dia sem refeicao), para diferenciar de "refeicao registrada sem foto". */
  faded?: boolean;
  /** Se informado, a arte e lida por leitor de tela com este texto; sem ele e puramente decorativa (escondida do leitor). */
  accessibilityLabel?: string;
}

/**
 * Capa ilustrada de uma refeicao SEM foto: um prato visto de cima, em roxo (borda, fundo claro e aro interno), com garfo e faca estilizados e um
 * brilho discreto. E so arte (desenhada em codigo com react-native-svg, original): calorias, contagens e textos continuam os reais, e a capa nunca
 * substitui uma foto (onde ha foto, a foto e mostrada).
 */
export function MealCoverArt({ size = 56, variant = 'purple', tone, faded = false, accessibilityLabel }: MealCoverArtProps) {
  const c = paletteFor(variant, tone);
  const decorative = !accessibilityLabel;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      opacity={faded ? 0.4 : 1}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      {/* prato: sombra suave, borda, fundo claro e aro interno */}
      <Circle cx={50} cy={53} r={33} fill={c.line} opacity={0.12} />
      <Circle cx={50} cy={50} r={33} fill={c.rim} />
      <Circle cx={50} cy={50} r={27} fill={c.plate} />
      <Circle cx={50} cy={50} r={19} fill="none" stroke={c.ring} strokeWidth={2.5} />
      {/* brilho discreto no canto superior esquerdo */}
      <Path d="M30 36 A24 24 0 0 1 44 27" fill="none" stroke={c.shine} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
      {/* garfo (esquerda) */}
      <G stroke={c.line} strokeLinecap="round" fill="none">
        <Path d="M10 22 V36 M15 22 V36 M20 22 V36" strokeWidth={2.2} />
        <Path d="M10 36 Q15 42 20 36" strokeWidth={2.2} />
        <Path d="M15 40 V78" strokeWidth={3} />
      </G>
      {/* faca (direita) */}
      <G fill={c.line}>
        <Path d="M86 20 Q95 34 88 50 L84 50 L84 20 Z" />
        <Rect x={84} y={50} width={4} height={28} rx={2} />
      </G>
    </Svg>
  );
}
