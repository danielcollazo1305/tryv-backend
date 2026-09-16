import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { ChallengeCard2 } from '@/components/ChallengeCard2';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getApiErrorMessage } from '@/services/api';
import { Challenge, listTrainerChallenges, parseUtcDate } from '@/services/challenges';
import { listMyDietPlans } from '@/services/dietPlans';
import { TrainerPublic, getMyTrainerProfile, getTrainer, licenseLabel } from '@/services/trainers';
import { listWorkoutPlans } from '@/services/workouts';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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
 *
 * Migrado pro tema claro "prism-glass" nesta tarefa (ScreenBackground2 ->
 * ScreenBackground3, LiquiglassCard -> GlassCard, colors2 -> colors3) — so
 * troca de tokens/componentes visuais, nenhuma logica de dados alterada.
 * ChallengeCard2 ganhou uma prop variant ('dark' padrao, 'light' aqui) pra
 * nao afetar o uso ainda escuro em trainers/[id].tsx.
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
              <Ionicons name="add" size={16} color={colors3.onPrimary} />
              <Text style={styles.createButtonText}>Criar</Text>
            </Pressable>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {loading && <ActivityIndicator color={colors3.primary} style={styles.loading} />}
        </View>
      }
      renderItem={({ item }) => (
        <ChallengeCard2
          challenge={item.challenge}
          creatorName={item.creator?.user_name}
          creatorCredential={
            item.creator ? `${licenseLabel(item.creator.professional_type)} ${item.creator.license_number}` : undefined
          }
          variant="light"
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing3.md }} />}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={32} color={colors3.onSurfaceVariant} />
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
        <GlassCard variant="card" style={styles.categoryCard}>
          <View style={styles.categoryIconWrap}>
            <Ionicons name="barbell" size={24} color={colors3.primary} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>Musculação/Corrida</Text>
            <Text style={styles.categorySubtitle}>Desafios mensais oficiais do Tryv Fit de treino e corrida</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
        </GlassCard>
      </Pressable>

      <Pressable
        onPress={() => router.push({ pathname: '/challenges/category/[category]', params: { category: 'alimentacao' } })}
      >
        <GlassCard variant="card" style={styles.categoryCard}>
          <View style={styles.categoryIconWrap}>
            <Ionicons name="restaurant" size={24} color={colors3.primary} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>Alimentação</Text>
            <Text style={styles.categorySubtitle}>Desafios mensais oficiais do Tryv Fit de alimentação</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors3.onSurfaceVariant} />
        </GlassCard>
      </Pressable>
    </View>
  );
}

export default function ChallengesScreen() {
  const [activeTab, setActiveTab] = useState<TopTab>('app');

  return (
    <ScreenBackground3 style={styles.flex}>
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
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: spacing3.containerMargin, paddingTop: spacing3.xl, paddingBottom: spacing3.md, gap: spacing3.md },
  title: { ...typography3.headlineLgMobile, fontSize: 26 },

  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors3.surfaceContainer,
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    padding: 4,
  },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: spacing3.sm, borderRadius: radius3.pill },
  tabButtonSelected: { backgroundColor: colors3.primary },
  tabButtonText: { ...typography3.bodyMd, fontSize: 14, fontWeight: '600', color: colors3.onSurfaceVariant },
  tabButtonTextSelected: { color: colors3.onPrimary },

  appTabContent: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.md },
  categoryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  categoryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: { flex: 1, gap: 4 },
  categoryTitle: { ...typography3.bodyMd, fontSize: 16, fontWeight: '700' },
  categorySubtitle: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },

  listContent: { padding: spacing3.containerMargin, paddingTop: 0, paddingBottom: spacing3.xl },
  personalHeader: { gap: spacing3.sm, marginBottom: spacing3.md },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors3.primary,
    borderRadius: 999,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
  },
  createButtonText: { ...typography3.labelSm, textTransform: 'none', color: colors3.onPrimary, fontWeight: '700' },
  error: { color: colors3.error, textAlign: 'center' },
  loading: { marginTop: spacing3.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, gap: spacing3.sm },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
