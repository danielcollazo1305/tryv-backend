import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Body, { Slug } from 'react-native-body-highlighter';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { colors2, spacing2, typography2 } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Corpo do SvgWrapper e 200x400 em scale=1 (ver node_modules/react-native-body-highlighter) —
// calcula a escala pra caber 2 diagramas (frente + costas) lado a lado dentro do card.
const AVAILABLE_WIDTH = SCREEN_WIDTH - spacing2.containerMargin * 2 - spacing2.lg * 2 - spacing2.md;
const DIAGRAM_SCALE = Math.min(0.85, AVAILABLE_WIDTH / 2 / 200);

interface MuscleDiagramProps {
  muscles: Slug[];
}

/**
 * Diagrama de anatomia com destaque muscular (item 1) — usa
 * react-native-body-highlighter (pacote npm dedicado, ver investigacao no
 * relatorio da tarefa: mantido, sem dependencia nativa alem do
 * react-native-svg que o projeto ja tem, cobre todos os grupos
 * musculares relevantes pra academia). Mostra frente + costas lado a
 * lado, porque os grupos de um dia costumam se dividir entre os dois
 * lados (ex: peito/biceps na frente, costas/posterior atras) — um unico
 * lado deixaria metade do destaque invisivel.
 */
export function MuscleDiagram({ muscles }: MuscleDiagramProps) {
  if (muscles.length === 0) {
    return (
      <LiquiglassCard style={styles.emptyCard}>
        <Text style={styles.emptyText}>
          Nao foi possivel identificar os grupos musculares deste treino.
        </Text>
      </LiquiglassCard>
    );
  }

  const data = muscles.map((slug) => ({ slug, color: colors2.violet }));

  return (
    <LiquiglassCard style={styles.card}>
      <Text style={styles.title}>Grupos musculares do dia</Text>
      <View style={styles.diagramsRow}>
        <View style={styles.diagramWrap}>
          <Body
            data={data}
            side="front"
            scale={DIAGRAM_SCALE}
            colors={[colors2.violet]}
            defaultFill={colors2.surfaceContainerHigh}
            border={colors2.outlineVariant}
          />
          <Text style={styles.diagramLabel}>Frente</Text>
        </View>
        <View style={styles.diagramWrap}>
          <Body
            data={data}
            side="back"
            scale={DIAGRAM_SCALE}
            colors={[colors2.violet]}
            defaultFill={colors2.surfaceContainerHigh}
            border={colors2.outlineVariant}
          />
          <Text style={styles.diagramLabel}>Costas</Text>
        </View>
      </View>
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md, alignItems: 'center' },
  title: { ...typography2.headlineMd, fontSize: 16, alignSelf: 'flex-start' },
  diagramsRow: { flexDirection: 'row', gap: spacing2.md, alignItems: 'flex-start' },
  diagramWrap: { alignItems: 'center', gap: spacing2.xs },
  diagramLabel: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
  emptyCard: { alignItems: 'center' },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
});
