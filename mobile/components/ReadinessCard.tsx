import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { Card } from '@/components/Card';
import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { fetchLastNightSleepHours } from '@/services/healthkit';
import { getTodayReadiness, Readiness } from '@/services/readiness';
import { colors, radius, spacing, typography } from '@/constants/theme';

function scoreColor(score: number): string {
  if (score >= 70) return colors.success;
  if (score >= 40) return colors.accent;
  return colors.danger;
}

/**
 * Score de prontidao pra treino. Sempre mostra alguma pontuacao — o pilar de
 * carga de treino (backend) esta disponivel mesmo sem Apple Health, entao em
 * vez de bloquear o card atras de "conecte o Health primeiro" (como faz o
 * HealthSummaryCard, que nao tem nada sem HealthKit), aqui mostramos o score
 * parcial e so avisamos que falta o sono — mesmo espirito do fallback do
 * daily_insight no backend (nunca "sem dado nenhum", sempre algo util).
 */
export function ReadinessCard() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    try {
      let sleepHours: number | null = null;
      if (Platform.OS === 'ios') {
        const connected = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
        if (connected) {
          try {
            sleepHours = await fetchLastNightSleepHours();
          } catch {
            sleepHours = null;
          }
        }
      }
      setReadiness(await getTodayReadiness(sleepHours));
    } catch {
      setReadiness(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchReadiness();
    }, [fetchReadiness])
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  if (!readiness) return null;

  const color = scoreColor(readiness.final_score);

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.badge, { borderColor: color }]}>
          <Text style={[styles.badgeNumber, { color }]}>{Math.round(readiness.final_score)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>Prontidao para treino</Text>
          <Text style={styles.recommendation}>{readiness.recommendation_text}</Text>
        </View>
      </View>
      {readiness.sleep_score == null && (
        <Text style={styles.hint}>
          Conecte o Apple Health na aba Atividades para incluir seu sono nessa pontuacao.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing.xs },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNumber: { fontSize: 20, fontWeight: '800' },
  info: { flex: 1, gap: spacing.xs },
  title: { ...typography.h3 },
  recommendation: { ...typography.bodySecondary },
  hint: { ...typography.caption, color: colors.textMuted },
});
