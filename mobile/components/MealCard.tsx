import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { Meal, formatMealTime } from '@/services/meals';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

export function MealCard({ meal }: { meal: Meal }) {
  return (
    <LiquiglassCard style={styles.card} padding={spacing2.md}>
      {meal.photo_url ? (
        <Image source={{ uri: meal.photo_url }} style={styles.photo} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Ionicons name="restaurant" size={22} color={colors2.primary} />
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
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing2.md,
    alignItems: 'center',
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: radius2.md,
    backgroundColor: colors2.surfaceContainerHigh,
  },
  photoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius2.md,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: spacing2.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    ...typography2.bodyMd,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing2.sm,
  },
  time: { ...typography2.labelCaps, textTransform: 'none' },
  calories: { ...typography2.headlineMd, fontSize: 18 },
  macrosRow: { flexDirection: 'row', gap: spacing2.md },
  macro: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
});
