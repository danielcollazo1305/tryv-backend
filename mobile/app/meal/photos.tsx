import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { Meal, formatMealDateTime, listMeals } from '@/services/meals';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

/**
 * Historico visual de fotos de refeicao ("feed pessoal") — item 4. Tela
 * separada em vez de secao dentro de (tabs)/meals.tsx: essa tela ja
 * acumulou bastante conteudo novo (grid 2x2, deficit/superavit,
 * historico com grafico) e um feed de fotos rolavel dentro de outro
 * conteudo rolavel competiria por espaco/atencao — mesmo padrao ja usado
 * em outras telas desta sessao (ex: trainers/select-type, social/follows)
 * de extrair secao secundaria pra tela propria em vez de empilhar tudo.
 *
 * Reaproveita listMeals() (endpoint ja existente, sem mudanca de backend)
 * filtrando client-side por photo_url != null — Meal.photo_url ja e
 * persistido de verdade hoje (confirmado no fluxo de meal/add.tsx:
 * uploadMedia() sobe a foto pro S3 antes de createMeal()), entao esse
 * historico usa dado real, nao inventado.
 */
export default function MealPhotosScreen() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMeals(await listMeals());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o historico de fotos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMeals();
    }, [fetchMeals])
  );

  // listMeals() ja vem ordenado logged_at desc (ver GET /meals/) — so filtra quem tem foto.
  const photosOnly = meals.filter((meal) => !!meal.photo_url);

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Historico de fotos</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={photosOnly}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <LiquiglassCard style={styles.photoCard} padding={0}>
            <Image source={{ uri: item.photo_url! }} style={styles.photo} />
            <View style={styles.info}>
              <Text style={styles.description} numberOfLines={1}>
                {item.description ?? 'Refeicao'}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{formatMealDateTime(item.logged_at)}</Text>
                <Text style={styles.meta}>{Math.round(item.calories ?? 0)} kcal</Text>
              </View>
            </View>
          </LiquiglassCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={32} color={colors2.onSurfaceVariant} />
              <Text style={styles.emptyText}>
                {error ?? 'Nenhuma refeicao com foto registrada ainda.'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={loading ? <ActivityIndicator color={colors2.violet} style={styles.loading} /> : null}
      />
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  listContent: { padding: spacing2.containerMargin, paddingTop: 0, paddingBottom: spacing2.xl },

  photoCard: { overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors2.surfaceContainerHigh },
  info: { padding: spacing2.md, gap: spacing2.xs },
  description: { ...typography2.bodyMd, fontWeight: '600', fontSize: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },

  loading: { marginVertical: spacing2.lg },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl * 2, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
});
