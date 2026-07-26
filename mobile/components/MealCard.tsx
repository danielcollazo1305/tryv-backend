import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import { Meal, formatMealTime } from '@/services/meals';
import { colors, radius, spacing, typography } from '@/constants/theme';

export function MealCard({ meal }: { meal: Meal }) {
  return (
    <Card style={styles.card}>
      {meal.photo_url ? (
        <Image source={{ uri: meal.photo_url }} style={styles.photo} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Ionicons name="restaurant" size={22} color={colors.accent} />
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  photoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  time: { ...typography.caption },
  calories: { ...typography.h3 },
  macrosRow: { flexDirection: 'row', gap: spacing.md },
  macro: { ...typography.bodySecondary },
});
