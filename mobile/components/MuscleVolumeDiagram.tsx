import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Body, { Slug } from 'react-native-body-highlighter';

import { colors3, spacing3 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Corpo de 200x400 em scale=1: duas figuras (frente e costas) lado a lado dentro da largura da tela.
const AVAILABLE_WIDTH = SCREEN_WIDTH - spacing3.containerMargin * 2 - spacing3.md;
const SCALE = Math.min(0.85, AVAILABLE_WIDTH / 2 / 200);

// Do mais claro ao mais escuro: nivel 1 = pouco volume no periodo, nivel 4 = o musculo mais trabalhado.
const SHADES = ['#d9c9fa', '#b99cf3', '#8f63e6', colors3.primary];

interface MuscleVolumeDiagramProps {
  /** Musculos com nivel de cor de 1 a 4 (ver diagramData em services/muscleVolumeState.ts). */
  data: { slug: string; intensity: number }[];
}

/**
 * Diagrama de anatomia (frente e costas) no tema claro, com os musculos trabalhados no periodo pintados por volume. O mesmo pacote do
 * MuscleDiagram do treino (react-native-body-highlighter), so que em tons de roxo por intensidade e sem o cartao escuro.
 */
export function MuscleVolumeDiagram({ data }: MuscleVolumeDiagramProps) {
  const bodyData = data.map((d) => ({ slug: d.slug as Slug, intensity: d.intensity }));
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel="Diagrama do corpo com os músculos mais trabalhados no período destacados"
    >
      {(['front', 'back'] as const).map((side) => (
        <View key={side} style={styles.figure}>
          <Body
            data={bodyData}
            side={side}
            scale={SCALE}
            colors={SHADES}
            defaultFill={colors3.surfaceContainerHigh}
            border={colors3.outlineVariant}
          />
          <Text style={styles.label}>{side === 'front' ? 'Frente' : 'Costas'}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing3.md },
  figure: { alignItems: 'center', gap: spacing3.xs },
  label: { fontSize: 12, color: colors3.onSurfaceVariant },
});
