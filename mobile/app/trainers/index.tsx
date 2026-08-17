import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { ProfessionalType, TrainerPublic, formatPriceBRL, licenseLabel, listTrainers } from '@/services/trainers';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

const TABS: { value: ProfessionalType; label: string; emptyText: string }[] = [
  { value: 'personal_trainer', label: 'Personal Trainers', emptyText: 'Nenhum personal trainer disponivel no momento.' },
  { value: 'nutritionist', label: 'Nutricionistas', emptyText: 'Nenhum nutricionista disponivel no momento.' },
];

function TrainerCard({ trainer }: { trainer: TrainerPublic }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/trainers/[id]', params: { id: trainer.id } })}>
      <LiquiglassCard style={styles.card} padding={spacing2.md}>
        <View style={styles.cardTopRow}>
          <Avatar initials={getInitials(trainer.user_name)} size={56} />
          <View style={styles.cardInfo}>
            <Text style={styles.name}>{trainer.user_name}</Text>
            <View style={styles.licenseBadge}>
              <Text style={styles.licenseText}>
                {licenseLabel(trainer.professional_type)} {trainer.license_number}
              </Text>
            </View>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>MENSALIDADE</Text>
            <Text style={styles.price}>{formatPriceBRL(trainer.price)}</Text>
          </View>
        </View>

        {!!trainer.bio && (
          <Text style={styles.bio} numberOfLines={2}>
            {trainer.bio}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.viewProfile}>Ver perfil</Text>
          <Ionicons name="chevron-forward" size={16} color={colors2.primary} />
        </View>
      </LiquiglassCard>
    </Pressable>
  );
}

// Validos: 'personal_trainer' | 'nutritionist' — os mesmos valores de TABS.
function isProfessionalType(value: unknown): value is ProfessionalType {
  return TABS.some((tab) => tab.value === value);
}

export default function TrainersScreen() {
  // Param opcional 'type' — permite abrir a tela ja numa aba especifica
  // (ex: Home > Acompanhamento profissional > Nutricionista), sem duplicar
  // a logica de filtro que ja existe aqui. Sem o param, comportamento
  // identico ao de antes (sempre comeca em 'personal_trainer').
  const { type } = useLocalSearchParams<{ type?: string }>();
  const [trainers, setTrainers] = useState<TrainerPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfessionalType>(
    isProfessionalType(type) ? type : 'personal_trainer'
  );
  const [search, setSearch] = useState('');

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

  // Busca e so um filtro local sobre a lista ja carregada — nao existe
  // endpoint de busca hoje, entao filtra client-side por nome/bio.
  const filteredTrainers = useMemo(() => {
    const byTab = trainers.filter((trainer) => trainer.professional_type === activeTab);
    const query = search.trim().toLowerCase();
    if (!query) return byTab;
    return byTab.filter(
      (trainer) =>
        trainer.user_name.toLowerCase().includes(query) || (trainer.bio ?? '').toLowerCase().includes(query)
    );
  }, [trainers, activeTab, search]);
  const activeTabInfo = TABS.find((tab) => tab.value === activeTab)!;

  return (
    <ScreenBackground2 style={styles.flex}>
      <FlatList
        data={filteredTrainers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Encontre Profissionais</Text>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors2.onSurfaceVariant} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nome, especialidade..."
                placeholderTextColor={colors2.onSurfaceVariant}
                value={search}
                onChangeText={setSearch}
              />
            </View>

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
            {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}
          </View>
        }
        renderItem={({ item }) => <TrainerCard trainer={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing2.sm }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={32} color={colors2.onSurfaceVariant} />
              <Text style={styles.emptyText}>{activeTabInfo.emptyText}</Text>
            </View>
          ) : null
        }
      />
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.xl },
  header: { gap: spacing2.md, marginBottom: spacing2.md },
  title: { ...typography2.headlineLgMobile, fontSize: 26 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.sm,
    backgroundColor: colors2.surfaceContainerHigh,
    borderRadius: radius2.pill,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    paddingHorizontal: spacing2.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing2.sm + 4, color: colors2.onSurface, fontSize: 16 },
  tabRow: { flexDirection: 'row', gap: spacing2.sm },
  tabPill: {
    flex: 1,
    paddingVertical: spacing2.sm + 2,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    alignItems: 'center',
  },
  tabPillSelected: {
    backgroundColor: colors2.violet,
    borderColor: colors2.violet,
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  tabPillText: { ...typography2.labelCaps, textTransform: 'none' },
  tabPillTextSelected: { color: colors2.white, fontWeight: '700' },
  error: { color: colors2.danger, textAlign: 'center' },
  loading: { marginTop: spacing2.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },

  card: { gap: spacing2.sm },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  cardInfo: { flex: 1, gap: spacing2.xs },
  name: { ...typography2.headlineMd, fontSize: 17 },
  licenseBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing2.sm,
    paddingVertical: 2,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  licenseText: { ...typography2.labelCaps, fontSize: 10 },
  priceCol: { alignItems: 'flex-end' },
  priceLabel: { ...typography2.labelCaps, fontSize: 9 },
  price: { ...typography2.metricMono, fontSize: 16, color: colors2.primary },
  bio: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing2.xs },
  viewProfile: { ...typography2.labelCaps, textTransform: 'none', color: colors2.primary },
});
