import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface GoalProgressBarProps {
  label: string;
  current: number;
  /** null = usuario ainda nao definiu essa meta (ex: User.daily_protein_goal ausente). */
  goal: number | null;
  /** Unidade mostrada apos os numeros -- 'g' por padrao (uso atual e so proteina). */
  unit?: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Barra de progresso estilo "XP" pra uma meta diaria em gramas (hoje so
 * proteina, ver User.daily_protein_goal / settings/calorie-goal.tsx) --
 * enche de 0 a 100% (clamped, nao estoura a barra mesmo passando da meta)
 * com animacao via Animated, a mesma API ja usada no resto do app (ver
 * LiveDot em app/trainers/students.tsx e o pulse de PostCard2.tsx) --
 * react-native-reanimated nao e uma dependencia direta do projeto, so uma
 * transitiva no lockfile.
 *
 * Sem meta definida (goal == null): nao mostra barra nenhuma (nao ha nada
 * pra comparar), so um link pra ir definir a meta.
 *
 * GlassCard (nao LiquiglassCard) de proposito -- GlassCard.tsx aplica
 * `style` direto no content interno (ver comentario la), entao um
 * `gap`/flexDirection aqui funciona sem precisar de contentStyle.
 */
export function GoalProgressBar({ label, current, goal, unit = 'g' }: GoalProgressBarProps) {
  const progress = goal ? clamp01(current / goal) : 0;
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false, // width nao e suportado pelo native driver
    }).start();
  }, [progress, widthAnim]);

  if (goal == null) {
    return (
      <GlassCard variant="glass" style={styles.card}>
        <Text style={styles.label}>{label}</Text>
        <Pressable onPress={() => router.push('/settings/calorie-goal')} hitSlop={8} style={styles.defineLink}>
          <Text style={styles.defineLinkText}>Definir meta de proteína</Text>
          <Ionicons name="chevron-forward" size={16} color={colors3.primary} />
        </Pressable>
      </GlassCard>
    );
  }

  const remaining = Math.max(0, Math.round(goal - current));
  const goalReached = current >= goal;

  return (
    <GlassCard variant="glass" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(current)}
          <Text style={styles.valueGoal}> / {Math.round(goal)} {unit}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
      <Text style={styles.statusText}>{goalReached ? 'Meta batida' : `Faltam ${remaining} ${unit}`}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  value: { ...typography3.headlineLg, fontSize: 18, color: colors3.onSurface },
  valueGoal: { ...typography3.headlineMd, fontSize: 13, color: colors3.onSurfaceVariant },
  track: {
    height: 8,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceVariant,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius3.pill,
    backgroundColor: colors3.primary,
  },
  statusText: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  defineLink: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  defineLinkText: { ...typography3.bodyMd, fontFamily: 'Inter_600SemiBold', color: colors3.primary },
});
