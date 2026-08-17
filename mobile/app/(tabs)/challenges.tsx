import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { ChallengeCard2 } from '@/components/ChallengeCard2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { Challenge, listTrainerChallenges, parseUtcDate } from '@/services/challenges';
import { listMyDietPlans } from '@/services/dietPlans';
import { TrainerPublic, getMyTrainerProfile, getTrainer, licenseLabel } from '@/services/trainers';
import { listWorkoutPlans } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface ChallengeWithCreator {
  challenge: Challenge;
  creator: TrainerPublic | null;
}

type TopTab = 'app' | 'personal';

/**
 * Reformulacao da aba Desafios: 2 abas no topo.
 *
 * Nomeacao escolhida ("App"/"Personal", nao "Do Tryv"/"Dos Profissionais"):
 * um segmented control de largura total com 2 opcoes fica apertado com
 * labels longos — "App"/"Personal" e curto o suficiente pra caber bem, e
 * ja reflete o mesmo par de conceitos usado no resto do app (conteudo do
 * Tryv vs. marketplace de profissionais, ex: "Treino com IA" vs. secao do
 * Personal Trainer em (tabs)/workout.tsx).
 */
const TOP_TABS: { key: TopTab; label: string }[] = [
  { key: 'app', label: 'App' },
  { key: 'personal', label: 'Personal' },
];

/**
 * Lacuna de arquitetura (nao e um dado inventado, e uma limitacao real
 * assumida de proposito, decidida com o usuario): nao existe hoje um
 * endpoint "todos os desafios da comunidade" nem uma nocao de "meus
 * profissionais/assinaturas". listTrainerChallenges() e escopado a UM
 * trainer_id por vez.
 *
 * Pra nao inventar nem endpoint nem dado, essa aba deriva a lista de
 * profissionais "conhecidos" a partir de dados reais ja buscados em outras
 * telas: trainer_id de planos alimentares (listMyDietPlans) e de planos de
 * treino atribuidos por um professor (listWorkoutPlans, quando
 * trainer_id != null). Isso cobre quem ja te deu um plano — nao
 * necessariamente todo profissional que voce assina (uma assinatura sem
 * plano ainda nao aparece aqui). Documentado tambem na tela para o usuario
 * final.
 */
async function resolveKnownTrainerIds(): Promise<string[]> {
  const [dietPlans, workoutPlans] = await Promise.all([
    listMyDietPlans().catch(() => []),
    listWorkoutPlans().catch(() => []),
  ]);
  const ids = new Set<string>();
  dietPlans.forEach((plan) => ids.add(plan.trainer_id));
  workoutPlans.forEach((plan) => {
    if (plan.trainer_id) ids.add(plan.trainer_id);
  });
  return Array.from(ids);
}

function PersonalTab() {
  const [items, setItems] = useState<ChallengeWithCreator[]>([]);
  const [hasKnownTrainers, setHasKnownTrainers] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trainerIds, myTrainerProfile] = await Promise.all([
        resolveKnownTrainerIds(),
        getMyTrainerProfile().catch(() => null),
      ]);
      setCanCreate(myTrainerProfile?.professional_type === 'personal_trainer');
      setHasKnownTrainers(trainerIds.length > 0);

      const perTrainer = await Promise.all(
        trainerIds.map(async (trainerId) => {
          const [challenges, creator] = await Promise.all([
            listTrainerChallenges(trainerId).catch(() => []),
            getTrainer(trainerId).catch(() => null),
          ]);
          return challenges.map((challenge) => ({ challenge, creator }));
        })
      );

      const now = Date.now();
      const flattened = perTrainer
        .flat()
        .filter(({ challenge }) => parseUtcDate(challenge.end_date).getTime() > now)
        .sort((a, b) => parseUtcDate(a.challenge.end_date).getTime() - parseUtcDate(b.challenge.end_date).getTime());

      setItems(flattened);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os desafios.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.challenge.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.personalHeader}>
          {canCreate && (
            <Pressable style={styles.createButton} onPress={() => router.push('/challenges/new')}>
              <Ionicons name="add" size={16} color={colors2.white} />
              <Text style={styles.createButtonText}>Criar</Text>
            </Pressable>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}
        </View>
      }
      renderItem={({ item }) => (
        <ChallengeCard2
          challenge={item.challenge}
          creatorName={item.creator?.user_name}
          creatorCredential={
            item.creator ? `${licenseLabel(item.creator.professional_type)} ${item.creator.license_number}` : undefined
          }
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing2.md }} />}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={32} color={colors2.onSurfaceVariant} />
            <Text style={styles.emptyText}>
              {hasKnownTrainers
                ? 'Nenhum desafio ativo dos seus profissionais no momento.'
                : 'Voce ainda nao tem um plano de treino ou alimentar de um profissional para ver desafios aqui.'}
            </Text>
          </View>
        ) : null
      }
    />
  );
}

/**
 * Sem arte propria pras 2 categorias (nao existe imagem de capa pronta pra
 * "Musculacao/Corrida"/"Alimentacao", diferente dos cards com foto da Home)
 * — usa o mesmo padrao de card com icone ja usado nas opcoes do Perfil, em
 * vez de forcar ImageCoverCard sem imagem de verdade.
 */
function AppTab() {
  return (
    <View style={styles.appTabContent}>
      <Pressable
        onPress={() => router.push({ pathname: '/challenges/category/[category]', params: { category: 'musculacao_corrida' } })}
      >
        <LiquiglassCard style={styles.categoryCard}>
          <View style={styles.categoryIconWrap}>
            <Ionicons name="barbell" size={24} color={colors2.primary} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>Musculação/Corrida</Text>
            <Text style={styles.categorySubtitle}>Desafios mensais oficiais do Tryv de treino e corrida</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
        </LiquiglassCard>
      </Pressable>

      <Pressable
        onPress={() => router.push({ pathname: '/challenges/category/[category]', params: { category: 'alimentacao' } })}
      >
        <LiquiglassCard style={styles.categoryCard}>
          <View style={styles.categoryIconWrap}>
            <Ionicons name="restaurant" size={24} color={colors2.primary} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>Alimentação</Text>
            <Text style={styles.categorySubtitle}>Desafios mensais oficiais do Tryv de alimentação</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
        </LiquiglassCard>
      </Pressable>
    </View>
  );
}

export default function ChallengesScreen() {
  const [activeTab, setActiveTab] = useState<TopTab>('app');

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Desafios</Text>
        <View style={styles.tabSwitcher}>
          {TOP_TABS.map((tab) => {
            const selected = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, selected && styles.tabButtonSelected]}
              >
                <Text style={[styles.tabButtonText, selected && styles.tabButtonTextSelected]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {activeTab === 'app' ? <AppTab /> : <PersonalTab />}
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.md, gap: spacing2.md },
  title: { ...typography2.headlineLgMobile, fontSize: 26 },

  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors2.surfaceContainer,
    borderRadius: radius2.pill,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    padding: 4,
  },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: spacing2.sm, borderRadius: radius2.pill },
  tabButtonSelected: { backgroundColor: colors2.violet },
  tabButtonText: { ...typography2.bodyMd, fontSize: 14, fontWeight: '600', color: colors2.onSurfaceVariant },
  tabButtonTextSelected: { color: colors2.white },

  appTabContent: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  categoryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing2.md },
  categoryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius2.md,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: { flex: 1, gap: 4 },
  categoryTitle: { ...typography2.bodyMd, fontSize: 16, fontWeight: '700' },
  categorySubtitle: { ...typography2.bodyMd, fontSize: 13, color: colors2.onSurfaceVariant },

  listContent: { padding: spacing2.containerMargin, paddingTop: 0, paddingBottom: spacing2.xl },
  personalHeader: { gap: spacing2.sm, marginBottom: spacing2.md },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors2.violet,
    borderRadius: 999,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm,
  },
  createButtonText: { ...typography2.labelCaps, color: colors2.white },
  error: { color: colors2.danger, textAlign: 'center' },
  loading: { marginTop: spacing2.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing2.xl, gap: spacing2.sm },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
});
