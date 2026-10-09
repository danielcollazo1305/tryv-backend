import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { MealCard } from '@/components/MealCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getApiErrorMessage } from '@/services/api';
import { Meal, getMealDays, listMealsByDate } from '@/services/meals';
import { formatKcalNumber, formatLongDate, mealsCountLabel, parseDateOnly } from '@/utils/mealDays';
import { colors3, spacing3, typography3 } from '@/constants/theme';

/** Volta para a tela anterior (a aba Refeicoes); se nao houver historico (link direto), vai para a aba. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/meals');
}

/**
 * Tela de um dia da aba Refeicoes (push normal, sem modal): cabecalho com voltar e a data por extenso, resumo do
 * dia (kcal e P/C/G somados da propria lista) e as refeicoes do dia em ordem de horario, com a foto grande. Abre
 * pela fileira "Ultimos 7 dias". Recarrega ao ganhar foco (ex: ao voltar de "Adicionar refeicao") e por
 * pull-to-refresh. "Adicionar refeicao" so aparece em HOJE (o app nao registra refeicao em data passada); "hoje"
 * e o primeiro item de GET /meals/days (dia do servidor), com o relogio do aparelho so como reserva.
 */
export default function MealDayScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const parsed = parseDateOnly(date);

  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [serverToday, setServerToday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (!date || !parseDateOnly(date)) return;
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        // "Hoje" vem do servidor (1 item); se essa chamada falhar, nao bloqueia a lista.
        const [list, today] = await Promise.all([
          listMealsByDate(date),
          getMealDays(1).then((items) => items[0]?.date ?? null).catch(() => null),
        ]);
        setMeals(list);
        setServerToday(today);
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar as refeições deste dia.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date]
  );

  useFocusEffect(
    useCallback(() => {
      load(meals === null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const totals = useMemo(
    () =>
      (meals ?? []).reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories ?? 0),
          protein: acc.protein + (meal.protein ?? 0),
          carbs: acc.carbs + (meal.carbs ?? 0),
          fat: acc.fat + (meal.fat ?? 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [meals]
  );

  // Parametro invalido: mensagem e voltar (nada de chamada de rede).
  if (!parsed || !date) {
    return (
      <ScreenBackground3 style={styles.flex}>
        <Header title="Dia inválido" />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={32} color={colors3.onSurfaceVariant} />
          <Text style={styles.stateText}>Essa data não é válida.</Text>
          <Button3 label="Voltar" variant="secondary" onPress={goBack} />
        </View>
      </ScreenBackground3>
    );
  }

  // Reserva (so se GET /meals/days falhar): dia do aparelho. Normal: o primeiro dia devolvido pelo servidor.
  const isTodayServer = serverToday !== null ? serverToday === date : isDeviceToday(date);
  const count = meals?.length ?? 0;

  return (
    <ScreenBackground3 style={styles.flex}>
      <Header title={formatLongDate(date)} />

      <FlatList
        data={meals ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(false);
            }}
            tintColor={colors3.primary}
          />
        }
        ListHeaderComponent={
          meals !== null && !error ? (
            <GlassCard variant="glass" style={styles.summary}>
              <Text style={styles.summaryKcal}>{formatKcalNumber(totals.calories)} kcal</Text>
              <Text style={styles.summaryCount}>{count === 0 ? 'Nenhuma refeição' : mealsCountLabel(count)}</Text>
              <View style={styles.macrosRow}>
                <Text style={styles.macro}>P {Math.round(totals.protein)}g</Text>
                <Text style={styles.macro}>C {Math.round(totals.carbs)}g</Text>
                <Text style={styles.macro}>G {Math.round(totals.fat)}g</Text>
              </View>
            </GlassCard>
          ) : null
        }
        renderItem={({ item }) => <MealCard meal={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors3.primary} style={styles.loading} />
          ) : error ? (
            <View style={styles.centered}>
              <Ionicons name="alert-circle-outline" size={32} color={colors3.error} />
              <Text style={[styles.stateText, { color: colors3.error }]}>{error}</Text>
              <Button3 label="Tentar de novo" variant="secondary" onPress={() => load(true)} />
            </View>
          ) : (
            <View style={styles.centered}>
              <Ionicons name="restaurant-outline" size={32} color={colors3.onSurfaceVariant} />
              <Text style={styles.stateText}>Nenhuma refeição neste dia</Text>
            </View>
          )
        }
        ListFooterComponent={
          isTodayServer && !loading && !error ? (
            <View style={styles.footer}>
              <Button3 label="Adicionar refeição" onPress={() => router.push('/meal/add')} />
            </View>
          ) : null
        }
      />
    </ScreenBackground3>
  );
}

/** Reserva: a data de hoje no relogio do aparelho como 'YYYY-MM-DD'. */
function isDeviceToday(date: string): boolean {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return date === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar" style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.back} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing3.sm,
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  back: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { ...typography3.headlineMd, fontSize: 18, flex: 1, textAlign: 'center' },
  listContent: { padding: spacing3.containerMargin, paddingTop: 0, paddingBottom: spacing3.xl * 2 },
  summary: { gap: spacing3.xs, marginBottom: spacing3.md },
  summaryKcal: { ...typography3.headlineLg, fontSize: 28, lineHeight: 34 },
  summaryCount: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  macrosRow: { flexDirection: 'row', gap: spacing3.md, marginTop: spacing3.xs },
  macro: { ...typography3.bodyMd, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors3.onSurfaceVariant },
  loading: { marginTop: spacing3.xl },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.md },
  stateText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  footer: { marginTop: spacing3.lg },
});
