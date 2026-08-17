import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { colors2, spacing2, typography2 } from '@/constants/theme';

interface CalorieBalanceCardProps {
  caloriesToday: number;
  calorieGoal: number | null;
}

/**
 * Deficit/superavit calorico de HOJE (reset diario, igual ao MacrosGrid —
 * mesma base de dado: totals do dia filtrado por isToday(), que ja usa o
 * fuso local do dispositivo via Date do JS, nao UTC cru — confirmado
 * correto sem precisar de mudanca).
 *
 * Cor: verde suave pra deficit (dentro do esperado — a meta e um teto, nao
 * bater ela e o resultado "bom" pra quem quer emagrecer/manter), roxo
 * neutro pra superavit pequeno, e um tom de atencao (nao vermelho de
 * erro) so quando o superavit passa de 20% da meta — bom senso pedido
 * explicitamente pra nao parecer punitivo.
 */
export function CalorieBalanceCard({ caloriesToday, calorieGoal }: CalorieBalanceCardProps) {
  if (calorieGoal == null) {
    return (
      <Pressable onPress={() => router.push('/settings/calorie-goal')}>
        <LiquiglassCard style={styles.card}>
          <Ionicons name="flag-outline" size={20} color={colors2.onSurfaceVariant} />
          <Text style={styles.emptyText}>Configure sua meta calorica para ver aqui</Text>
        </LiquiglassCard>
      </Pressable>
    );
  }

  const balance = calorieGoal - caloriesToday;
  const isDeficit = balance >= 0;
  const surplusRatio = isDeficit ? 0 : Math.abs(balance) / calorieGoal;
  const color = isDeficit ? colors2.success : surplusRatio > 0.2 ? colors2.danger : colors2.primary;
  const icon = isDeficit ? 'trending-down' : 'trending-up';
  const label = isDeficit
    ? `Deficit de ${Math.round(Math.abs(balance)).toLocaleString('pt-BR')} kcal hoje`
    : `Superavit de ${Math.round(Math.abs(balance)).toLocaleString('pt-BR')} kcal hoje`;

  return (
    <LiquiglassCard style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: hexToRgba(color, 0.12) }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.balanceText, { color }]}>{label}</Text>
    </LiquiglassCard>
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
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceText: { ...typography2.bodyMd, fontWeight: '700', flex: 1 },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, flex: 1 },
});
