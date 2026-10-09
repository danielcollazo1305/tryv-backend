import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { CalorieBalanceCard } from '@/components/CalorieBalanceCard';
import { DayStrip } from '@/components/DayStrip';
import { GlassCard } from '@/components/GlassCard';
import { DietPlanBanner } from '@/components/DietPlanBanner';
import { GoalProgressBar } from '@/components/GoalProgressBar';
import { MacrosGrid } from '@/components/MacrosGrid';
import { MealCard } from '@/components/MealCard';
import { MealsHistoryCard } from '@/components/MealsHistoryCard';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { WaterCreatineCards } from '@/components/WaterCreatineCards';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Meal, MealDay, getMealDays, isToday, listMeals } from '@/services/meals';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

export default function MealsScreen() {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fileira dos 7 dias: null = carregando pela primeira vez; erro de rede = a fileira some (daysFailed) e o resto
  // da aba segue normal. Em recargas (foco/pull-to-refresh) os dados antigos ficam na tela, sem piscar.
  const [days, setDays] = useState<MealDay[] | null>(null);
  const [daysFailed, setDaysFailed] = useState(false);

  const fetchDays = useCallback(async () => {
    try {
      setDays(await getMealDays(7));
      setDaysFailed(false);
    } catch {
      setDaysFailed(true);
    }
  }, []);

  const fetchMeals = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await listMeals();
      setMeals(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar suas refeições.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recarrega toda vez que a aba ganha foco (ex: ao voltar de "Adicionar refeicao")
  useFocusEffect(
    useCallback(() => {
      fetchMeals(true);
      fetchDays();
    }, [fetchMeals, fetchDays])
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
    fetchDays();
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <FlatList
        data={todaysMeals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors3.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.logo}>Tryv Fit</Text>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.title}>Refeições</Text>
                <Text style={styles.subtitle}>Hoje</Text>
              </View>
              {/* Entrada pro Perfil (Perfil saiu da tab bar, ver (tabs)/_layout.tsx). ProfileAvatarButton e compartilhado com Home/Feed/Ranking/Treino — estava 100% colors2 ate ser migrado numa tarefa separada (achado na investigacao anterior, comentario antigo aqui estava incorreto). */}
              <ProfileAvatarButton size={36} />
            </View>

            {/* Hoje = o PRIMEIRO item devolvido pelo servidor (nao recalcula pelo relogio do aparelho). */}
            {!daysFailed && (
              <DayStrip
                days={days}
                onPressDay={(day) => router.push({ pathname: '/meal/day/[date]', params: { date: day.date } })}
                onPressSeeAll={() => router.push('/meal/photos')}
              />
            )}

            <DietPlanBanner />

            <MacrosGrid
              calories={totals.calories}
              protein={totals.protein}
              carbs={totals.carbs}
              fat={totals.fat}
              calorieGoal={user?.daily_calorie_goal ?? null}
            />

            <CalorieBalanceCard caloriesToday={totals.calories} calorieGoal={user?.daily_calorie_goal ?? null} />

            <GoalProgressBar label="Proteína" current={totals.protein} goal={user?.daily_protein_goal ?? null} />

            <MealsHistoryCard />

            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors3.primary} style={styles.loading} />}

            <WaterCreatineCards />

            <Text style={styles.sectionTitle}>Refeições de hoje</Text>

            {/*
              Card fixo "Adicionar refeicao" — substitui o FAB flutuante
              (recem corrigido de posicao, mas o pedido agora e nao ser mais
              flutuante). Sempre visivel aqui dentro do ListHeaderComponent
              (renderizado 1x, antes da lista/estado vazio), entao aparece
              tanto com refeicoes ja registradas quanto no estado vazio —
              nao depende de `todaysMeals.length`. Mesma acao de antes
              (abrir app/meal/add.tsx), nenhuma logica nova.
            */}
            <GlassCard variant="glass" style={styles.addMealCard}>
              <View style={styles.addMealHeader}>
                <View style={styles.addMealIconWrap}>
                  <Ionicons name="add" size={20} color={colors3.primary} />
                </View>
                <Text style={styles.addMealTitle}>Adicionar refeição</Text>
              </View>
              <Button3 label="Registrar refeição" onPress={() => router.push('/meal/add')} />
              <Button3 label="Usar refeição salva" variant="secondary" onPress={() => router.push('/meal/saved')} />
              <Button3 label="Buscar alimento" variant="secondary" onPress={() => router.push('/meal/food-search')} />
            </GlassCard>
          </View>
        }
        renderItem={({ item }) => <MealCard meal={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={32} color={colors3.onSurfaceVariant} />
              <Text style={styles.emptyText}>Nenhuma refeição registrada hoje ainda.</Text>
            </View>
          ) : null
        }
      />
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing3.containerMargin, paddingTop: spacing3.xl, paddingBottom: spacing3.xl * 2 },
  header: { gap: spacing3.md, marginBottom: spacing3.md },
  logo: { ...typography3.displayLg, fontFamily: 'Inter_800ExtraBold', fontSize: 36, color: colors3.primary },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: -spacing3.sm },
  error: { color: colors3.error, textAlign: 'center' },
  loading: { marginTop: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 18, marginTop: spacing3.xs },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.sm },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

  addMealCard: { gap: spacing3.md },
  addMealHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  addMealIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius3.sm,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMealTitle: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
});
