import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import { ProfessionalType, TrainerPublic, formatPriceBRL, listTrainers } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

const TABS: { value: ProfessionalType; label: string; emptyText: string }[] = [
  { value: 'personal_trainer', label: 'Personal Trainers', emptyText: 'Nenhum personal trainer disponivel no momento.' },
  { value: 'nutritionist', label: 'Nutricionistas', emptyText: 'Nenhum nutricionista disponivel no momento.' },
];

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
  const [activeTab, setActiveTab] = useState<ProfessionalType>('personal_trainer');

  const fetchTrainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrainers(await listTrainers());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os profissionais.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTrainers();
    }, [fetchTrainers])
  );

  const filteredTrainers = useMemo(
    () => trainers.filter((trainer) => trainer.professional_type === activeTab),
    [trainers, activeTab]
  );
  const activeTabInfo = TABS.find((tab) => tab.value === activeTab)!;

  return (
    <View style={styles.flex}>
      <FlatList
        data={filteredTrainers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Profissionais</Text>
            <Text style={styles.subtitle}>Encontre um profissional certificado para te acompanhar.</Text>

            <View style={styles.tabRow}>
              {TABS.map((tab) => {
                const selected = tab.value === activeTab;
                return (
                  <Pressable
                    key={tab.value}
                    onPress={() => setActiveTab(tab.value)}
                    style={[styles.tabPill, selected && styles.tabPillSelected]}
                  >
                    <Text style={[styles.tabPillText, selected && styles.tabPillTextSelected]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>

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
              <Text style={styles.emptyText}>{activeTabInfo.emptyText}</Text>
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
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  tabPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabPillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tabPillText: { ...typography.bodySecondary, color: colors.text, fontWeight: '600' },
  tabPillTextSelected: { color: colors.white, fontWeight: '700' },
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
