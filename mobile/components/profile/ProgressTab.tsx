import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { WeightChart } from '@/components/WeightChart';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import type { WeightPoint } from '@/services/dashboard';

interface ProgressTabProps {
  /** Peso dos ultimos 30 dias (null = carregando), erro e nova tentativa: vem de useWeightPoints, na tela de perfil. */
  points: WeightPoint[] | null;
  error: boolean;
  onRetry: () => void;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPercentage?: number | null;
  /** Os 4 cards de consistencia (sequencia atual, melhor sequencia, total de treinos, dias ativos), vindos da tela de perfil. */
  consistency?: React.ReactNode;
}

const fmt = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',');

/**
 * Aba Progresso do SEU perfil: peso (grafico dos ultimos 30 dias, que o app ja tem, e atalhos para registrar e ver o historico), medidas
 * (o que o usuario ja informou: altura, peso e % de gordura), consistencia (os 4 cards que ja existiam no perfil) e um atalho "Musculos".
 * O atalho "Musculos" abre a tela app/muscles.tsx (series concluidas por grupo muscular). Esta aba so existe no SEU perfil (o endpoint e so do proprio usuario).
 */
export function ProgressTab({ points, error, onRetry, weightKg, heightCm, bodyFatPercentage, consistency }: ProgressTabProps) {
  const latest = points && points.length > 0 ? points[points.length - 1].weight_kg : weightKg ?? null;
  const change = points && points.length >= 2 ? points[points.length - 1].weight_kg - points[0].weight_kg : null;
  const measures: { label: string; value: string }[] = [];
  if (heightCm != null) measures.push({ label: 'Altura', value: `${fmt(heightCm, 0)} cm` });
  if (latest != null) measures.push({ label: 'Peso', value: `${fmt(latest)} kg` });
  if (bodyFatPercentage != null) measures.push({ label: 'Gordura corporal', value: `${fmt(bodyFatPercentage)}%` });

  return (
    <View style={styles.box}>
      <GlassCard variant="card" padding={spacing3.md} style={styles.card}>
        <Text style={styles.sectionTitle}>Peso</Text>
        {error ? (
          <View style={styles.centerBox}>
            <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
              Não foi possível carregar seu peso.
            </Text>
            <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button" accessibilityLabel="Tentar de novo">
              <Text style={styles.retryText}>Tentar de novo</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {latest != null && (
              <Text style={styles.bigValue}>
                {fmt(latest)} <Text style={styles.unit}>kg</Text>
                {change != null && (
                  <Text style={styles.change}>
                    {'  '}
                    {change > 0 ? '+' : ''}
                    {fmt(change)} kg em 30 dias
                  </Text>
                )}
              </Text>
            )}
            {points === null ? <Text style={styles.muted}>Carregando…</Text> : <WeightChart data={points} />}
          </>
        )}
        <View style={styles.buttonsRow}>
          <Pressable onPress={() => router.push('/weight/new')} style={styles.linkButton} accessibilityRole="button" accessibilityLabel="Registrar peso">
            <Ionicons name="add-circle-outline" size={18} color={colors3.primary} />
            <Text style={styles.linkText}>Registrar peso</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/weight')} style={styles.linkButton} accessibilityRole="button" accessibilityLabel="Ver histórico de peso">
            <Ionicons name="time-outline" size={18} color={colors3.primary} />
            <Text style={styles.linkText}>Ver histórico</Text>
          </Pressable>
        </View>
      </GlassCard>

      <GlassCard variant="card" padding={spacing3.md} style={styles.card}>
        <Text style={styles.sectionTitle}>Medidas</Text>
        {measures.length > 0 ? (
          measures.map((m) => (
            <View key={m.label} style={styles.measureRow} accessible accessibilityLabel={`${m.label}: ${m.value}`}>
              <Text style={styles.measureLabel}>{m.label}</Text>
              <Text style={styles.measureValue}>{m.value}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Você ainda não informou suas medidas.</Text>
        )}
      </GlassCard>

      {consistency}

      <Pressable
        style={[styles.muscles, styles.musclesBox]}
        onPress={() => router.push('/muscles')}
        accessibilityRole="button"
        accessibilityLabel="Músculos: séries concluídas por grupo muscular"
      >
        <Ionicons name="body-outline" size={20} color={colors3.primary} />
        <Text style={styles.musclesTitle}>Músculos</Text>
        <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: spacing3.md },
  card: { gap: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 16 },
  bigValue: { ...typography3.headlineMd, fontSize: 28 },
  unit: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  change: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  muted: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  centerBox: { alignItems: 'center', gap: spacing3.sm, paddingVertical: spacing3.sm },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: spacing3.lg, borderRadius: radius3.pill, borderWidth: 1, borderColor: colors3.primary, alignItems: 'center', justifyContent: 'center' },
  retryText: { ...typography3.labelMd, color: colors3.primary, textTransform: 'none' },
  buttonsRow: { flexDirection: 'row', gap: spacing3.md, flexWrap: 'wrap' },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs, minHeight: 44 },
  linkText: { ...typography3.labelMd, color: colors3.primary, textTransform: 'none' },
  measureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  measureLabel: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  measureValue: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  muscles: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm, padding: spacing3.md, borderRadius: radius3.xl },
  musclesBox: { backgroundColor: colors3.surfaceContainerHigh },
  musclesTitle: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold', flex: 1 },
});
