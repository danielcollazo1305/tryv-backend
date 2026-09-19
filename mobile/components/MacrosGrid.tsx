import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface MacrosGridProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** daily_calorie_goal do usuario — so a meta de kcal existe hoje (User nao tem meta individual de macro), ver decisao documentada no componente. */
  calorieGoal: number | null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Grid 2x2 de nutrientes de HOJE (reset diario) — substitui a antiga linha
 * de 4 colunas simples. Ordem escolhida: Calorias | Proteina na linha de
 * cima (as duas metricas mais acompanhadas, calorias primeiro por ser o
 * "hero"), Carboidrato | Gordura embaixo — documentado aqui por nao ter
 * sido especificado.
 *
 * Só o tile de Calorias tem barra de progresso: é a única meta individual
 * que existe de verdade (User.daily_calorie_goal — não há meta de grama
 * por macro em lugar nenhum do backend). Os outros 3 tiles mostram só o
 * valor absoluto, sem barra.
 *
 * Migrado pro tema claro "prism-glass" (GlassCard/colors3) seguindo o
 * mockup aprovado da tela de Refeicoes.
 *
 * Sem icone nos tiles (removido a pedido — cards ficam so com label +
 * valor, ver historico do componente se precisar recuperar as cores por
 * metrica: Calorias = colors3.primary, Proteina = #FB7185, Carboidrato =
 * #F5A524, Gordura = #818CF8).
 */
export function MacrosGrid({ calories, protein, carbs, fat, calorieGoal }: MacrosGridProps) {
  const calorieProgress = calorieGoal ? clamp01(calories / calorieGoal) : null;

  return (
    <GlassCard variant="glass" style={styles.card}>
      <View style={styles.grid}>
        <View style={styles.tile}>
          <Text style={styles.label}>Calorias</Text>
          <Text style={styles.value}>
            {Math.round(calories)}
            {calorieGoal != null && <Text style={styles.valueGoal}> / {Math.round(calorieGoal)}</Text>}
            <Text style={styles.unit}> kcal</Text>
          </Text>
          {calorieProgress != null && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${calorieProgress * 100}%`, backgroundColor: colors3.primary }]} />
            </View>
          )}
        </View>

        <View style={styles.tile}>
          <Text style={styles.label}>Proteína</Text>
          <Text style={styles.value}>
            {Math.round(protein)}
            <Text style={styles.unit}> g</Text>
          </Text>
        </View>

        <View style={styles.tile}>
          <Text style={styles.label}>Carboidrato</Text>
          <Text style={styles.value}>
            {Math.round(carbs)}
            <Text style={styles.unit}> g</Text>
          </Text>
        </View>

        <View style={styles.tile}>
          <Text style={styles.label}>Gordura</Text>
          <Text style={styles.value}>
            {Math.round(fat)}
            <Text style={styles.unit}> g</Text>
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing3.xs,
    padding: spacing3.md,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  label: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  value: { ...typography3.headlineLg, fontSize: 22, lineHeight: 26, color: colors3.onSurface },
  valueGoal: { ...typography3.headlineMd, fontSize: 14, lineHeight: 18, color: colors3.onSurfaceVariant },
  // Mesmo token de HealthMetricsGrid.tileUnit (typography3.labelSm,
  // Inter_500Medium) -- era bodyMd (Inter_400Regular), divergente do
  // padrao de referencia.
  unit: { ...typography3.labelSm, color: colors3.onSurfaceVariant },
  progressTrack: {
    height: 4,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceVariant,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: { height: '100%', borderRadius: radius3.pill },
});
