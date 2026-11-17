import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';

import { GlassCard } from '@/components/GlassCard';
import { useVitality } from '@/hooks/useVitality';
import { VITALITY_LABELS, VITALITY_NO_DATA_MESSAGE, scoreToColor } from '@/services/vitality';
import { VITALITY_DISCLAIMER, VITALITY_PROVISIONAL_NOTE, vitalityAccessibilityLabel, vitalityRecommendation } from '@/services/vitalityView';
import { colors3, spacing3, typography3 } from '@/constants/theme';

const RING_SIZE = 64;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Vitalidade na Home (so Pro): o MESMO valor dinamico das demais telas (hook useVitality, servico vitalityService), nunca o final_score do backend. Anel com o
 * numero, rotulo do estado (Em forma / Atencao / Recuperar, limiares 65/40), orientacao curta e o aviso de que e uma estimativa de bem-estar, nao medida
 * medica. Antes de acordar mostra o valor de ontem a noite marcado como provisorio.
 */
export function ReadinessCard() {
  const { load, vitality, state, fetchData } = useVitality();

  if (load.kind === 'loading') {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors3.primary} />
      </View>
    );
  }

  if (load.kind === 'error') {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.title}>Vitalidade</Text>
        <Text style={styles.recommendation}>Não foi possível carregar.</Text>
        <Pressable onPress={fetchData} accessibilityRole="button" accessibilityLabel="Tentar de novo" hitSlop={8}>
          <Text style={styles.link}>Tentar de novo</Text>
        </Pressable>
      </GlassCard>
    );
  }

  const score = vitality && vitality.score !== null ? vitality.score : null;
  if (state === 'nodata' || score === null) {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.title}>Vitalidade</Text>
        <Pressable onPress={() => router.push('/activity')} accessibilityRole="button" accessibilityLabel={`${VITALITY_NO_DATA_MESSAGE}. Abre a tela de conexão.`} hitSlop={8}>
          <Text style={styles.link}>{VITALITY_NO_DATA_MESSAGE}</Text>
        </Pressable>
        <Text style={styles.hint}>{VITALITY_DISCLAIMER}</Text>
      </GlassCard>
    );
  }

  const color = scoreToColor(score) ?? colors3.primary;
  const progress = Math.max(0, Math.min(1, score / 100));

  return (
    <GlassCard style={styles.card}>
      <View style={styles.row} accessible accessibilityLabel={vitalityAccessibilityLabel(state, score, vitality?.indicators, vitality?.provisional)}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke={colors3.surfaceContainerHigh} strokeWidth={RING_STROKE} fill="none" />
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
          <Text style={[styles.ringNumber, { color }]}>{Math.round(score)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>Vitalidade · {VITALITY_LABELS[state]}</Text>
          <Text style={styles.recommendation}>{vitalityRecommendation(state)}</Text>
        </View>
      </View>
      {!!vitality?.provisional && <Text style={styles.hint}>{VITALITY_PROVISIONAL_NOTE}</Text>}
      {vitality?.indicators.sleep == null && !vitality?.provisional && (
        <Text style={styles.hint}>Conecte o Apple Health na aba Atividades para incluir seu sono nessa pontuação.</Text>
      )}
      <Text style={styles.hint}>{VITALITY_DISCLAIMER}</Text>
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
  link: { ...typography3.bodyMd, fontSize: 14, fontWeight: '700', color: colors3.primary, textDecorationLine: 'underline' },
});
