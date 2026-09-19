import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { colors3, spacing3, typography3 } from '@/constants/theme';

interface CalorieBalanceCardProps {
  caloriesToday: number;
  calorieGoal: number | null;
}

// Verde do mockup aprovado (deficit — resultado "bom" pra quem quer
// emagrecer/manter) — colors3 nao tem token semantico de sucesso, mesma
// situacao ja resolvida assim no badge de variacao de Passos/Calorias.
const DEFICIT_COLOR = '#15803d';

/**
 * Deficit/superavit calorico de HOJE (reset diario, igual ao MacrosGrid —
 * mesma base de dado: totals do dia filtrado por isToday(), que ja usa o
 * fuso local do dispositivo via Date do JS, nao UTC cru — confirmado
 * correto sem precisar de mudanca).
 *
 * Cor: verde suave pra deficit (dentro do esperado), roxo neutro pra
 * superavit pequeno, e um tom de atencao so quando o superavit passa de
 * 20% da meta.
 *
 * Migrado pro tema claro nesta tarefa — SEM adicionar a linha de
 * subtitulo "Meta de X kcal · nada registrado" que apareceu num rascunho
 * do mockup: confirmei contra o componente real que ele so tem 1 linha de
 * texto (`balanceText`), sem subtitulo nenhum — nao inventei essa
 * informacao nova.
 */
export function CalorieBalanceCard({ caloriesToday, calorieGoal }: CalorieBalanceCardProps) {
  if (calorieGoal == null) {
    return (
      <Pressable onPress={() => router.push('/settings/calorie-goal')}>
        <GlassCard variant="glass" style={styles.card}>
          <Ionicons name="flag-outline" size={20} color={colors3.onSurfaceVariant} />
          <Text style={styles.emptyText}>Configure sua meta calórica para ver aqui</Text>
        </GlassCard>
      </Pressable>
    );
  }

  const balance = calorieGoal - caloriesToday;
  const isDeficit = balance >= 0;
  const surplusRatio = isDeficit ? 0 : Math.abs(balance) / calorieGoal;
  const color = isDeficit ? DEFICIT_COLOR : surplusRatio > 0.2 ? colors3.error : colors3.primary;
  const icon = isDeficit ? 'trending-down' : 'trending-up';
  const label = isDeficit
    ? `Déficit de ${Math.round(Math.abs(balance)).toLocaleString('pt-BR')} kcal hoje`
    : `Superávit de ${Math.round(Math.abs(balance)).toLocaleString('pt-BR')} kcal hoje`;

  return (
    <GlassCard variant="glass" style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: hexToRgba(color, 0.12) }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.balanceText, { color }]}>{label}</Text>
    </GlassCard>
  );
}

/** As cores sao hex fixo (#RRGGBB) — converte pra rgba() (mesmo utilitario de HealthMetricsGrid/MacrosGrid). */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceText: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold', flex: 1 },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, flex: 1 },
});
