import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { colors2, metricColors, radius2, spacing2, typography2 } from '@/constants/theme';

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
 * valor absoluto, sem barra — uma barra "decorativa" sem meta real por
 * trás pareceria indicar um alvo que não existe, o que não é consistente
 * com o resto do app (ex: ObscuredCard/HealthMetricsGrid só usam barra
 * quando há uma referência real ou uma diretriz pública conhecida; não há
 * equivalente pra gramas de macro).
 */
export function MacrosGrid({ calories, protein, carbs, fat, calorieGoal }: MacrosGridProps) {
  const calorieProgress = calorieGoal ? clamp01(calories / calorieGoal) : null;

  return (
    <LiquiglassCard style={styles.card}>
      <View style={styles.grid}>
        <View style={styles.tile}>
          <View style={[styles.iconWrap, { backgroundColor: hexToRgba(colors2.violet, 0.12) }]}>
            <Ionicons name="flame" size={18} color={colors2.violet} />
          </View>
          <Text style={styles.label}>Calorias</Text>
          <Text style={styles.value}>
            {Math.round(calories)}
            {calorieGoal != null && <Text style={styles.valueGoal}> / {Math.round(calorieGoal)}</Text>}
            <Text style={styles.unit}> kcal</Text>
          </Text>
          {calorieProgress != null && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${calorieProgress * 100}%`, backgroundColor: colors2.violet }]} />
            </View>
          )}
        </View>

        <View style={styles.tile}>
          <View style={[styles.iconWrap, { backgroundColor: hexToRgba(metricColors.energy, 0.12) }]}>
            <Ionicons name="barbell" size={18} color={metricColors.energy} />
          </View>
          <Text style={styles.label}>Proteina</Text>
          <Text style={styles.value}>
            {Math.round(protein)}
            <Text style={styles.unit}> g</Text>
          </Text>
        </View>

        <View style={styles.tile}>
          <View style={[styles.iconWrap, { backgroundColor: hexToRgba(metricColors.steps, 0.12) }]}>
            <Ionicons name="leaf" size={18} color={metricColors.steps} />
          </View>
          <Text style={styles.label}>Carboidrato</Text>
          <Text style={styles.value}>
            {Math.round(carbs)}
            <Text style={styles.unit}> g</Text>
          </Text>
        </View>

        <View style={styles.tile}>
          <View style={[styles.iconWrap, { backgroundColor: hexToRgba(metricColors.sleep, 0.12) }]}>
            <Ionicons name="water" size={18} color={metricColors.sleep} />
          </View>
          <Text style={styles.label}>Gordura</Text>
          <Text style={styles.value}>
            {Math.round(fat)}
            <Text style={styles.unit}> g</Text>
          </Text>
        </View>
      </View>
    </LiquiglassCard>
  );
}

/** As cores de metrica sao hex fixo (#RRGGBB) — converte pra rgba() (mesmo utilitario ja usado em HealthMetricsGrid/HealthWeeklyBarChart). */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing2.xs,
    padding: spacing2.md,
    borderRadius: radius2.md,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius2.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
  value: { ...typography2.metricMono, fontSize: 22 },
  valueGoal: { ...typography2.metricMono, fontSize: 14, color: colors2.onSurfaceVariant },
  unit: { ...typography2.bodyMd, fontSize: 12, color: colors2.onSurfaceVariant },
  progressTrack: {
    height: 4,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: { height: '100%', borderRadius: radius2.pill },
});
