import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { RadialGlow } from '@/components/RadialGlow';
import {
  TodayWorkoutResult,
  getTodayOrNextWorkoutDay,
  isWorkoutPlanExpired,
  listWorkoutPlans,
} from '@/services/workouts';
import { colors3, spacing3, typography3 } from '@/constants/theme';

/**
 * Hero "Começar treino" do topo da Home — ponto de entrada UNIVERSAL pro
 * registro de treino, nao mais so pra quem tem plano de IA ativo batendo
 * com hoje:
 * - COM plano ativo pra hoje: comportamento original (day_of_week +
 *   getTodayOrNextWorkoutDay, ver services/workouts.ts) — mostra o treino
 *   do dia, leva pra aba Treino.
 * - SEM plano ativo: o card NAO desaparece mais (antes retornava null) —
 *   convida pro registro LIVRE (FreeWorkoutLogView.tsx, via
 *   workout-plan/free-session.tsx), sem depender de plano nenhum.
 * Religado no tema visual "prism-glass" (ver colors3 em constants/theme.ts).
 */
export function TodayWorkoutCard() {
  const [result, setResult] = useState<TodayWorkoutResult | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listWorkoutPlans()
        .then((plans) => {
          const aiPlan = plans.find((plan) => !plan.trainer_id && !isWorkoutPlanExpired(plan)) ?? null;
          if (!active) return;
          setResult(aiPlan ? getTodayOrNextWorkoutDay(aiPlan) : null);
        })
        .catch(() => {
          if (active) setResult(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  // undefined = ainda carregando (nao decidiu ainda se ha plano) — evita
  // "piscar" o variant errado antes da resposta chegar. null = decidido:
  // sem plano ativo pra hoje, mostra o variant de registro livre.
  if (result === undefined) return null;

  return (
    <GlassCard style={styles.card} padding={24}>
      <RadialGlow position="top-right" color={colors3.primary} opacity={0.12} radius="70%" cy="0%" />

      {result ? (
        <>
          <View style={styles.topRow}>
            <Text style={styles.eyebrow}>{result.isToday ? 'Hoje' : 'Próximo treino'}</Text>
            {result.day.estimated_duration_minutes != null && (
              <Text style={styles.duration}>{result.day.estimated_duration_minutes} min</Text>
            )}
          </View>
          <Text style={styles.title}>{result.day.focus}</Text>
          <Text style={styles.subtitle}>
            {result.day.exercises.length} exercício{result.day.exercises.length === 1 ? '' : 's'} · gerado pela IA a
            partir do seu histórico.
          </Text>
          <Button3 label="Começar treino" onPress={() => router.push('/(tabs)/workout')} />
        </>
      ) : (
        <>
          <View style={styles.topRow}>
            <Text style={styles.eyebrow}>Treino</Text>
          </View>
          <Text style={styles.title}>Começar treino</Text>
          <Text style={styles.subtitle}>
            Registre um treino livre: escolha os exercícios e acompanhe peso, reps e séries, sem depender de um
            plano.
          </Text>
          <Button3 label="Começar treino" onPress={() => router.push('/workout-plan/free-session')} />
        </>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...typography3.labelSm, color: colors3.primary, textTransform: 'uppercase' },
  duration: { ...typography3.labelSm, color: colors3.onSurfaceVariant },
  title: { ...typography3.headlineLg, fontSize: 28, lineHeight: 32, marginTop: spacing3.xs },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginBottom: spacing3.xs },
});
