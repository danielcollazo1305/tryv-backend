import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { MealCard } from '@/components/MealCard';
import { getApiErrorMessage } from '@/services/api';
import { Meal, isToday, listMeals } from '@/services/meals';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function MealsScreen() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMeals = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await listMeals();
      setMeals(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar suas refeicoes.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recarrega toda vez que a aba ganha foco (ex: ao voltar de "Adicionar refeicao")
  useFocusEffect(
    useCallback(() => {
      fetchMeals(true);
    }, [fetchMeals])
  );

  const todaysMeals = useMemo(() => meals.filter((meal) => isToday(meal.logged_at)), [meals]);

  const totals = useMemo(
    () =>
      todaysMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories ?? 0),
          protein: acc.protein + (meal.protein ?? 0),
          carbs: acc.carbs + (meal.carbs ?? 0),
          fat: acc.fat + (meal.fat ?? 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [todaysMeals]
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMeals(false);
  };

  return (
    <View style={styles.flex}>
      <FlatList
        data={todaysMeals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Refeicoes</Text>
            <Text style={styles.subtitle}>Hoje</Text>

            <Card style={styles.totalsCard}>
              <View style={styles.totalsRow}>
                <View style={styles.totalStat}>
                  <Text style={styles.statNumber}>{Math.round(totals.calories)}</Text>
                  <Text style={styles.statLabel}>kcal</Text>
                </View>
                <View style={styles.totalStat}>
                  <Text style={styles.statNumber}>{Math.round(totals.protein)}</Text>
                  <Text style={styles.statLabel}>proteina (g)</Text>
                </View>
                <View style={styles.totalStat}>
                  <Text style={styles.statNumber}>{Math.round(totals.carbs)}</Text>
                  <Text style={styles.statLabel}>carbo (g)</Text>
                </View>
                <View style={styles.totalStat}>
                  <Text style={styles.statNumber}>{Math.round(totals.fat)}</Text>
                  <Text style={styles.statLabel}>gordura (g)</Text>
                </View>
              </View>
            </Card>

            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => <MealCard meal={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma refeicao registrada hoje ainda.</Text>
            </View>
          ) : null
        }
      />

      <Pressable style={styles.fab} onPress={() => router.push('/meal/add')}>
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl * 2 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  title: { ...typography.h1 },
  subtitle: { ...typography.bodySecondary, marginTop: -spacing.sm },
  totalsCard: { marginTop: spacing.xs },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalStat: { alignItems: 'flex-start', flex: 1 },
  statNumber: { ...typography.statNumber, fontSize: 26 },
  statLabel: { ...typography.statLabel, marginTop: spacing.xs },
  error: { color: colors.danger, textAlign: 'center' },
  loading: { marginTop: spacing.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
