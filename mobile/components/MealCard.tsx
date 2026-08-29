import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from '@/components/GlassCard';
import { Meal, formatMealTime } from '@/services/meals';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

export function MealCard({ meal }: { meal: Meal }) {
  return (
    <GlassCard variant="card" style={styles.card}>
      {meal.photo_url ? (
        <Image source={{ uri: meal.photo_url }} style={styles.photo} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Ionicons name="restaurant" size={22} color={colors3.primary} />
        </View>
      )}

      <View style={styles.info}>
        <View style={styles.headerRow}>
          <Text style={styles.description} numberOfLines={1}>
            {meal.description ?? 'Refeicao'}
          </Text>
          <Text style={styles.time}>{formatMealTime(meal.logged_at)}</Text>
        </View>

        <Text style={styles.calories}>{Math.round(meal.calories ?? 0)} kcal</Text>

        <View style={styles.macrosRow}>
          <Text style={styles.macro}>P {Math.round(meal.protein ?? 0)}g</Text>
          <Text style={styles.macro}>C {Math.round(meal.carbs ?? 0)}g</Text>
          <Text style={styles.macro}>G {Math.round(meal.fat ?? 0)}g</Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing3.md,
    alignItems: 'center',
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: radius3.md,
    backgroundColor: colors3.surfaceVariant,
  },
  photoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: spacing3.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    ...typography3.bodyMd,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing3.sm,
  },
  time: { ...typography3.labelSm, textTransform: 'none' },
  calories: { ...typography3.headlineMd, fontSize: 18 },
  macrosRow: { flexDirection: 'row', gap: spacing3.md },
  macro: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
});
