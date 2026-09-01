import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getApiErrorMessage } from '@/services/api';
import { Meal, formatMealDateTime, listMeals } from '@/services/meals';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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
 *
 * Migrado pro tema claro "prism-glass" nesta tarefa (ScreenBackground2 ->
 * ScreenBackground3, LiquiglassCard -> GlassCard, colors2 -> colors3) — so
 * troca de tokens/componentes visuais, nenhuma logica alterada. Tela
 * autocontida (sem componente compartilhado com telas ainda escuras) —
 * migracao direta, sem prop variant.
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
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Historico de fotos</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={photosOnly}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <GlassCard variant="card" style={styles.photoCard} padding={0}>
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
          </GlassCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={32} color={colors3.onSurfaceVariant} />
              <Text style={styles.emptyText}>
                {error ?? 'Nenhuma refeicao com foto registrada ainda.'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={loading ? <ActivityIndicator color={colors3.primary} style={styles.loading} /> : null}
      />
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  listContent: { padding: spacing3.containerMargin, paddingTop: 0, paddingBottom: spacing3.xl },

  photoCard: { overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors3.surfaceContainerHigh },
  info: { padding: spacing3.md, gap: spacing3.xs },
  description: { ...typography3.bodyMd, fontWeight: '600', fontSize: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },

  loading: { marginVertical: spacing3.lg },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl * 2, gap: spacing3.sm },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
