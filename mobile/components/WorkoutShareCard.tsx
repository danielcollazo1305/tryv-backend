import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { WorkoutDay } from '@/services/workouts';
import { spacing } from '@/constants/theme';

interface WorkoutShareCardProps {
  userName: string;
  day: WorkoutDay;
}

/**
 * Cartao apresentacional puro (sem estado, sem fetch) capturado via
 * react-native-view-shot pra gerar a imagem de compartilhamento. Cores fixas
 * (nao usa o tema claro/escuro do resto do app) porque e sempre a mesma arte
 * de marca, independente do tema do dispositivo.
 */
export function WorkoutShareCard({ userName, day }: WorkoutShareCardProps) {
  const totalSets = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);

  const metrics: { label: string; value: number }[] = [
    { label: 'Exercicios', value: day.exercises.length },
    { label: 'Series', value: totalSets },
  ];
  if (day.estimated_duration_minutes != null) {
    metrics.push({ label: 'Minutos', value: day.estimated_duration_minutes });
  }
  if (day.estimated_calories != null) {
    metrics.push({ label: 'Kcal (est.)', value: day.estimated_calories });
  }

  return (
    <View style={styles.card}>
      <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <RadialGradient id="glowTop" cx="100%" cy="0%" r="90%">
            <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.55} />
            <Stop offset="55%" stopColor="#8B5CF6" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowBottom" cx="0%" cy="100%" r="90%">
            <Stop offset="0%" stopColor="#6D28D9" stopOpacity={0.65} />
            <Stop offset="60%" stopColor="#0B0B0F" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="#14121C" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowTop)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowBottom)" />
      </Svg>

      <View style={styles.content}>
        <View>
          <Text style={styles.eyebrow}>TREINO DE HOJE</Text>
          <Text style={styles.focus}>{day.focus}</Text>
          <Text style={styles.user}>
            {userName} · {day.day}
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          {metrics.map((metric) => (
            <View key={metric.label} style={styles.metricItem}>
              <Text style={styles.metricNumber}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        <View style={styles.brandRow}>
          <Text style={styles.brandName}>Tryv Fit</Text>
          <Text style={styles.brandTag}>treinei com o Tryv Fit</Text>
        </View>
      </View>
    </View>
  );
}

const CARD_TEXT = '#F5F5F7';
const CARD_TEXT_MUTED = 'rgba(245, 245, 247, 0.6)';

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#14121C',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: CARD_TEXT_MUTED,
    marginBottom: 6,
  },
  focus: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: CARD_TEXT,
    marginBottom: 4,
  },
  user: {
    fontSize: 14,
    color: CARD_TEXT_MUTED,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricItem: {
    width: '45%',
  },
  metricNumber: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: CARD_TEXT,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: CARD_TEXT_MUTED,
    marginTop: 2,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: '#C4B5FD',
  },
  brandTag: {
    fontSize: 10,
    color: 'rgba(245, 245, 247, 0.4)',
  },
});
