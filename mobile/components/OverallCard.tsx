import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';

import { GlassCard } from '@/components/GlassCard';
import { OverallStats, getOverallStats } from '@/services/overall';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

const RING_SIZE = 120;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type AttributeKey = Exclude<keyof OverallStats, 'overall'>;

const ATTRIBUTES: { key: AttributeKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'forca', label: 'Força', icon: 'barbell-outline' },
  { key: 'resistencia', label: 'Resistência', icon: 'walk-outline' },
  { key: 'consistencia', label: 'Consistência', icon: 'calendar-outline' },
  { key: 'disciplina', label: 'Disciplina', icon: 'nutrition-outline' },
];

/**
 * Overall do perfil (GET /dashboard/overall, ultimos 30 dias): anel com a
 * media dos 4 atributos no centro e uma linha por atributo (icone + label +
 * barra + valor). Recarrega a cada foco da aba (o Perfil fica montado na tab
 * bar, entao so "ao montar" deixaria o numero velho depois de um treino);
 * so mostra o spinner enquanto nao ha dado nenhum, pra nao piscar no refoco.
 */
export function OverallCard() {
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setFailed(false);
    getOverallStats()
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  if (!stats) {
    return (
      <GlassCard style={styles.stateBox}>
        {failed ? (
          <>
            <Text style={styles.errorText}>Não foi possível carregar seu overall.</Text>
            <Pressable onPress={load} hitSlop={8}>
              <Text style={styles.retryText}>Tentar de novo</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors3.primary} />
        )}
      </GlassCard>
    );
  }

  const ringOffset = RING_CIRCUMFERENCE * (1 - stats.overall / 100);

  return (
    <GlassCard style={styles.card}>
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
            stroke={colors3.primary}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={ringOffset}
            fill="none"
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.overallValue}>{stats.overall}</Text>
          <Text style={styles.overallLabel}>OVERALL</Text>
        </View>
      </View>

      <View style={styles.rows}>
        {ATTRIBUTES.map(({ key, label, icon }) => (
          <View key={key} style={styles.row}>
            <Ionicons name={icon} size={18} color={colors3.primary} />
            <Text style={styles.rowLabel}>{label}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${stats[key]}%` }]} />
            </View>
            <Text style={styles.rowValue}>{stats[key]}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footnote}>Últimos 30 dias</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', alignItems: 'center', gap: spacing3.md },
  stateBox: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: spacing3.sm, minHeight: 120 },
  errorText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant, textAlign: 'center' },
  retryText: { ...typography3.labelMd, color: colors3.primary },

  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  overallValue: { ...typography3.headlineLg, fontSize: 36, lineHeight: 40 },
  overallLabel: { ...typography3.labelSm, letterSpacing: 1.2 },

  rows: { alignSelf: 'stretch', gap: spacing3.sm + 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  rowLabel: { ...typography3.labelMd, width: 104 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius3.pill, backgroundColor: colors3.primary },
  rowValue: { ...typography3.labelMd, width: 28, textAlign: 'right' },

  footnote: { ...typography3.labelSm },
});
