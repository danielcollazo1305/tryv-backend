import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Svg, { Circle } from 'react-native-svg';

import { GlassCard } from '@/components/GlassCard';
import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { fetchLastNightSleepHours } from '@/services/health';
import { getTodayReadiness, Readiness } from '@/services/readiness';
import { colors3, spacing3, typography3 } from '@/constants/theme';

const RING_SIZE = 64;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// colors3 nao tem tokens semanticos de success/danger — resolvido caso a
// caso com hex literal, mesmo padrao ja usado em MonthComparisonCard
// (isUp/isDown) e Profile (streak).
const SCORE_COLOR_SUCCESS = '#15803d';

function scoreColor(score: number): string {
  if (score >= 70) return SCORE_COLOR_SUCCESS;
  if (score >= 40) return colors3.primary;
  return colors3.error;
}

/**
 * Score de prontidao pra treino. Sempre mostra alguma pontuacao — o pilar de
 * carga de treino (backend) esta disponivel mesmo sem Apple Health, entao em
 * vez de bloquear o card atras de "conecte o Health primeiro" (como faz o
 * HealthSummaryCard, que nao tem nada sem HealthKit), aqui mostramos o score
 * parcial e so avisamos que falta o sono — mesmo espirito do fallback do
 * daily_insight no backend (nunca "sem dado nenhum", sempre algo util).
 *
 * Migrado pro tema claro "prism-glass" nesta tarefa (LiquiglassCard ->
 * GlassCard, colors2 -> colors3) — exclusivo da Home (confirmado, nenhum
 * outro import real do componente), migracao direta sem prop variant. So
 * recoloracao, nenhuma logica de calculo de prontidao alterada.
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
        <ActivityIndicator size="small" color={colors3.primary} />
      </View>
    );
  }

  if (!readiness) return null;

  const color = scoreColor(readiness.final_score);
  const progress = Math.max(0, Math.min(1, readiness.final_score / 100));

  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors3.surfaceContainerHigh}
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
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing3.xs },
  card: { gap: spacing3.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringNumber: { position: 'absolute', fontSize: 18, fontWeight: '800' },
  info: { flex: 1, gap: spacing3.xs },
  title: { ...typography3.headlineMd, fontSize: 16, lineHeight: 20 },
  recommendation: { ...typography3.bodyMd, fontSize: 14, lineHeight: 20, color: colors3.onSurfaceVariant },
  hint: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
});
