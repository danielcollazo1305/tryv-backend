import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DietPlanMeal } from '@/services/dietPlans';
import { colors, spacing, typography } from '@/constants/theme';

export function DietPlanMealCard({ meal }: { meal: DietPlanMeal }) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.mealName}>{meal.name}</Text>
        {!!meal.time && <Text style={styles.mealTime}>{meal.time}</Text>}
      </View>

      {meal.items.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum item cadastrado.</Text>
      ) : (
        meal.items.map((item, index) => (
          <View
            key={`${item.food}-${index}`}
            style={[styles.itemRow, index === meal.items.length - 1 && styles.itemRowLast]}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.itemFood}>{item.food}</Text>
              {!!item.quantity && <Text style={styles.itemQuantity}>{item.quantity}</Text>}
            </View>
            {(item.calories != null || item.protein != null || item.carbs != null || item.fat != null) && (
              <Text style={styles.itemMacros}>
                {[
                  item.calories != null ? `${Math.round(item.calories)} kcal` : null,
                  item.protein != null ? `P ${Math.round(item.protein)}g` : null,
                  item.carbs != null ? `C ${Math.round(item.carbs)}g` : null,
                  item.fat != null ? `G ${Math.round(item.fat)}g` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  mealName: { ...typography.h3 },
  mealTime: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  emptyText: { ...typography.bodySecondary },
  itemRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  itemRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemFood: { ...typography.body, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  itemQuantity: { ...typography.body, color: colors.accent, fontWeight: '700' },
  itemMacros: { ...typography.caption },
});
