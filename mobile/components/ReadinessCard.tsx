import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Svg, { Circle } from 'react-native-svg';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { fetchLastNightSleepHours } from '@/services/health';
import { getTodayReadiness, Readiness } from '@/services/readiness';
import { colors2, spacing2, typography2 } from '@/constants/theme';

const RING_SIZE = 64;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function scoreColor(score: number): string {
  if (score >= 70) return colors2.success;
  if (score >= 40) return colors2.violet;
  return colors2.danger;
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
        <ActivityIndicator size="small" color={colors2.violet} />
      </View>
    );
  }

  if (!readiness) return null;

  const color = scoreColor(readiness.final_score);
  const progress = Math.max(0, Math.min(1, readiness.final_score / 100));

  return (
    <LiquiglassCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors2.surfaceContainerHigh}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={color}
              strokeWidth={RING_STROKE}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
              strokeLinecap="round"
              fill="none"
              rotation={-90}
              originX={RING_SIZE / 2}
              originY={RING_SIZE / 2}
            />
          </Svg>
          <Text style={[styles.ringNumber, { color }]}>{Math.round(readiness.final_score)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>Prontidão para treino</Text>
          <Text style={styles.recommendation}>{readiness.recommendation_text}</Text>
        </View>
      </View>
      {readiness.sleep_score == null && (
        <Text style={styles.hint}>
          Conecte o Apple Health na aba Atividades para incluir seu sono nessa pontuação.
        </Text>
      )}
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing2.xs },
  card: { gap: spacing2.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringNumber: { position: 'absolute', fontSize: 18, fontWeight: '800' },
  info: { flex: 1, gap: spacing2.xs },
  title: { ...typography2.headlineMd, fontSize: 16, lineHeight: 20 },
  recommendation: { ...typography2.bodyMd, fontSize: 14, lineHeight: 20, color: colors2.onSurfaceVariant },
  hint: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
});
