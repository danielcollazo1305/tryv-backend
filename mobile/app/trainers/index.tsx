import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import { TrainerPublic, formatPriceBRL, listTrainers } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

function TrainerCard({ trainer }: { trainer: TrainerPublic }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/trainers/[id]', params: { id: trainer.id } })}>
      <Card style={styles.card}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color={colors.accent} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{trainer.user_name}</Text>
          {!!trainer.bio && (
            <Text style={styles.bio} numberOfLines={2}>
              {trainer.bio}
            </Text>
          )}
          <Text style={styles.price}>{formatPriceBRL(trainer.price)}/mes</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

export default function TrainersScreen() {
  const [trainers, setTrainers] = useState<TrainerPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrainers(await listTrainers());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os professores.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTrainers();
    }, [fetchTrainers])
  );

  return (
    <View style={styles.flex}>
      <FlatList
        data={trainers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Professores</Text>
            <Text style={styles.subtitle}>Encontre um professor certificado para te acompanhar.</Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => <TrainerCard trainer={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhum professor disponivel no momento.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { ...typography.h1 },
  subtitle: { ...typography.bodySecondary, marginTop: -spacing.xs },
  error: { color: colors.danger, textAlign: 'center' },
  loading: { marginTop: spacing.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },

  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: spacing.xs },
  name: { ...typography.body, fontWeight: '600' },
  bio: { ...typography.bodySecondary },
  price: { ...typography.caption, color: colors.accent, fontWeight: '700' },
});
