import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { listMyDietPlans } from '@/services/dietPlans';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * So aparece se o aluno tiver ao menos um plano alimentar ativo — mesmo
 * padrao condicional do TrainersHighlight na Home. Qualquer falha (ex: rede)
 * simplesmente nao mostra o banner, sem bloquear o resto da aba.
 */
export function DietPlanBanner() {
  const [hasPlan, setHasPlan] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listMyDietPlans()
        .then((plans) => {
          if (active) setHasPlan(plans.length > 0);
        })
        .catch(() => {
          if (active) setHasPlan(false);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  if (!hasPlan) return null;

  return (
    <Pressable onPress={() => router.push('/diet-plan')}>
      <LiquiglassCard style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="nutrition" size={20} color={colors2.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>Seu plano alimentar</Text>
          <Text style={styles.subtitle}>Veja as refeicoes sugeridas pelo seu nutricionista</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
      </LiquiglassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius2.md,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: spacing2.xs },
  title: { ...typography2.bodyMd, fontWeight: '600' },
  subtitle: { ...typography2.labelCaps, textTransform: 'none' },
});
