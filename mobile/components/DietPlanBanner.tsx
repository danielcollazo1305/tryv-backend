import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { listMyDietPlans } from '@/services/dietPlans';
import { colors, radius, spacing, typography } from '@/constants/theme';

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
      <Card style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="nutrition" size={20} color={colors.accent} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>Seu plano alimentar</Text>
          <Text style={styles.subtitle}>Veja as refeicoes sugeridas pelo seu nutricionista</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: spacing.xs },
  title: { ...typography.body, fontWeight: '600' },
  subtitle: { ...typography.caption },
});
