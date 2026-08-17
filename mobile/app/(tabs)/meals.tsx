import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { CalorieBalanceCard } from '@/components/CalorieBalanceCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { DietPlanBanner } from '@/components/DietPlanBanner';
import { MacrosGrid } from '@/components/MacrosGrid';
import { MealCard } from '@/components/MealCard';
import { MealsHistoryCard } from '@/components/MealsHistoryCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Meal, isToday, listMeals } from '@/services/meals';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

export default function MealsScreen() {
  const { user } = useAuth();
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

  // Reset diario (item 1/2): isToday() ja compara em fuso local do
  // dispositivo (via Date do JS, nao string UTC crua) — confirmado
  // correto, sem precisar de ajuste, ver services/meals.ts.
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
    <ScreenBackground2 style={styles.flex}>
      <FlatList
        data={todaysMeals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors2.violet} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Refeições</Text>
            <Text style={styles.subtitle}>Hoje</Text>

            <DietPlanBanner />

            <MacrosGrid
              calories={totals.calories}
              protein={totals.protein}
              carbs={totals.carbs}
              fat={totals.fat}
              calorieGoal={user?.daily_calorie_goal ?? null}
            />

            <CalorieBalanceCard caloriesToday={totals.calories} calorieGoal={user?.daily_calorie_goal ?? null} />

            <MealsHistoryCard />

            <Pressable onPress={() => router.push('/meal/photos')}>
              <LiquiglassCard style={styles.photosLink} padding={spacing2.md}>
                <View style={styles.photosLinkIconWrap}>
                  <Ionicons name="images" size={18} color={colors2.violet} />
                </View>
                <Text style={styles.photosLinkText}>Historico de fotos</Text>
                <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
              </LiquiglassCard>
            </Pressable>

            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}

            <Text style={styles.sectionTitle}>Refeições de hoje</Text>
          </View>
        }
        renderItem={({ item }) => <MealCard meal={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing2.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={32} color={colors2.onSurfaceVariant} />
              <Text style={styles.emptyText}>Nenhuma refeicao registrada hoje ainda.</Text>
            </View>
          ) : null
        }
      />

      {/*
        Nota de escopo: o mockup refeicoes.html mostra "Registrar por foto
        (IA)" e "Registro manual" como botoes na propria tela. No app real
        esses dois fluxos vivem em app/meal/add.tsx (aberto por este FAB),
        uma tela separada que nao foi nomeada neste pedido — nao toquei
        nela, mesmo precedente de workout-plan/generate.tsx e share.tsx na
        migracao do Treino.
      */}
      <Pressable style={styles.fab} onPress={() => router.push('/meal/add')}>
        <Ionicons name="add" size={28} color={colors2.white} />
      </Pressable>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.xl * 2 },
  header: { gap: spacing2.md, marginBottom: spacing2.md },
  title: { ...typography2.headlineLgMobile, fontSize: 26 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: -spacing2.sm },
  error: { color: colors2.danger, textAlign: 'center' },
  loading: { marginTop: spacing2.sm },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18, marginTop: spacing2.xs },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

  photosLink: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  photosLinkIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius2.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photosLinkText: { ...typography2.bodyMd, fontWeight: '600', flex: 1 },

  fab: {
    position: 'absolute',
    right: spacing2.lg,
    bottom: spacing2.lg,
    width: 56,
    height: 56,
    borderRadius: radius2.pill,
    backgroundColor: colors2.violet,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});
