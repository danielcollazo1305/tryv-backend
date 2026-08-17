import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { ChallengeCard2 } from '@/components/ChallengeCard2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { Challenge, ChallengeCategory, listChallenges } from '@/services/challenges';
import { colors2, spacing2, typography2 } from '@/constants/theme';

const CATEGORY_TITLE: Record<ChallengeCategory, string> = {
  musculacao_corrida: 'Musculação/Corrida',
  alimentacao: 'Alimentação',
};

/** Listagem filtrada dos desafios oficiais do Tryv (aba "App" de Desafios) por categoria. */
export default function ChallengeCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: ChallengeCategory }>();
  const [items, setItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!category) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listChallenges({ is_official: true, category }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os desafios.'));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{CATEGORY_TITLE[category] ?? 'Desafios'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors2.onSurfaceVariant} />
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ChallengeCard2 challenge={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={32} color={colors2.onSurfaceVariant} />
              <Text style={styles.emptyText}>Nenhum desafio oficial nesta categoria no momento.</Text>
            </View>
          ) : null
        }
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
  title: { ...typography2.headlineMd, fontSize: 20 },
  error: { color: colors2.danger, textAlign: 'center', marginHorizontal: spacing2.containerMargin },
  loading: { marginTop: spacing2.md },
  listContent: { padding: spacing2.containerMargin, paddingTop: 0, paddingBottom: spacing2.xl },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
});
