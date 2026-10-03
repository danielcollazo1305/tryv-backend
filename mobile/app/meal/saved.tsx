import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getApiErrorMessage } from '@/services/api';
import { SavedMeal, deleteSavedMeal, getSavedMeals, logSavedMeal } from '@/services/savedMeals';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

function formatMacro(label: string, value: number | null): string | null {
  return value == null ? null : `${label} ${Math.round(value)}g`;
}

/** "320 kcal · P 30g · C 40g · G 8g" -- so os macros que existem no favorito. */
function summarize(meal: SavedMeal): string {
  const parts = [
    `${Math.round(meal.calories)} kcal`,
    formatMacro('P', meal.protein),
    formatMacro('C', meal.carbs),
    formatMacro('G', meal.fat),
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/**
 * Refeicoes salvas (favoritas): toque num item registra como refeicao de hoje
 * (POST /saved-meals/{id}/log) e fecha a tela, mesmo padrao de sucesso de
 * meal/add.tsx (router.back()). A lixeira pede confirmacao antes de apagar --
 * apagar o favorito nao mexe em refeicoes ja registradas com ele.
 */
export default function SavedMealsScreen() {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchMeals = useCallback(async () => {
    setError(null);
    try {
      setMeals(await getSavedMeals());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar suas refeições salvas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMeals();
    }, [fetchMeals])
  );

  const handleUse = async (meal: SavedMeal) => {
    if (busyId) return;
    setError(null);
    setBusyId(meal.id);
    try {
      await logSavedMeal(meal.id);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível registrar a refeição.'));
      setBusyId(null);
    }
  };

  const confirmDelete = (meal: SavedMeal) => {
    Alert.alert(
      'Remover refeição salva',
      `Remover "${meal.description ?? 'Refeição'}" dos favoritos? As refeições já registradas com ela não são afetadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setBusyId(meal.id);
            try {
              await deleteSavedMeal(meal.id);
              setMeals((prev) => prev.filter((item) => item.id !== meal.id));
            } catch (err) {
              setError(getApiErrorMessage(err, 'Não foi possível remover a refeição salva.'));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Refeições salvas</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors3.onSurfaceVariant} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors3.primary} />
        </View>
      ) : (
        <FlatList
          data={meals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={{ height: spacing3.sm }} />}
          ListHeaderComponent={!!error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={32} color={colors3.onSurfaceVariant} />
              <Text style={styles.emptyText}>
                Nenhuma refeição salva ainda. Ao registrar uma refeição, marque "Salvar como favorito" para reusá-la aqui.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            return (
              <GlassCard variant="glass" style={styles.itemCard} padding={spacing3.md}>
                <Pressable
                  style={styles.itemMain}
                  onPress={() => handleUse(item)}
                  disabled={!!busyId}
                  accessibilityRole="button"
                  accessibilityLabel={`Registrar ${item.description ?? 'refeição'} agora`}
                >
                  <View style={styles.itemTexts}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {item.description ?? 'Refeição'}
                    </Text>
                    <Text style={styles.itemSummary}>{summarize(item)}</Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={colors3.primary} />
                  ) : (
                    <Ionicons name="add-circle-outline" size={24} color={colors3.primary} />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(item)}
                  disabled={!!busyId}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Remover refeição salva"
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={20} color={colors3.onSurfaceVariant} />
                </Pressable>
              </GlassCard>
            );
          }}
        />
      )}
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
  title: { ...typography3.headlineMd, fontSize: 22 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing3.containerMargin, paddingTop: 0, paddingBottom: spacing3.xl },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center', marginBottom: spacing3.md },
  empty: { alignItems: 'center', gap: spacing3.sm, paddingVertical: spacing3.xl },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },

  itemCard: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  itemTexts: { flex: 1, gap: 2 },
  itemTitle: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  itemSummary: { ...typography3.labelSm, textTransform: 'none' },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radius3.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
