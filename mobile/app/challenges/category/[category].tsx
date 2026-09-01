import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { ChallengeCard2 } from '@/components/ChallengeCard2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getApiErrorMessage } from '@/services/api';
import { Challenge, ChallengeCategory, listChallenges } from '@/services/challenges';
import { colors3, spacing3, typography3 } from '@/constants/theme';

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
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>{CATEGORY_TITLE[category] ?? 'Desafios'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors3.onSurfaceVariant} />
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colors3.primary} style={styles.loading} />}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ChallengeCard2 challenge={item} variant="light" />}
        ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={32} color={colors3.onSurfaceVariant} />
              <Text style={styles.emptyText}>Nenhum desafio oficial nesta categoria no momento.</Text>
            </View>
          ) : null
        }
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
  title: { ...typography3.headlineMd, fontSize: 20 },
  error: { color: colors3.error, textAlign: 'center', marginHorizontal: spacing3.containerMargin },
  loading: { marginTop: spacing3.md },
  listContent: { padding: spacing3.containerMargin, paddingTop: 0, paddingBottom: spacing3.xl },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.sm },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
