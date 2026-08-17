import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { ChallengeCard2 } from '@/components/ChallengeCard2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { Challenge, listTrainerChallenges, parseUtcDate } from '@/services/challenges';
import { listMyDietPlans } from '@/services/dietPlans';
import { TrainerPublic, getMyTrainerProfile, getTrainer, licenseLabel } from '@/services/trainers';
import { listWorkoutPlans } from '@/services/workouts';
import { colors2, spacing2, typography2 } from '@/constants/theme';

interface ChallengeWithCreator {
  challenge: Challenge;
  creator: TrainerPublic | null;
}

/**
 * Lacuna de arquitetura (nao e um dado inventado, e uma limitacao real
 * assumida de proposito, decidida com o usuario): nao existe hoje um
 * endpoint "todos os desafios da comunidade" nem uma nocao de "meus
 * profissionais/assinaturas". listTrainerChallenges() e escopado a UM
 * trainer_id por vez.
 *
 * Pra nao inventar nem endpoint nem dado, essa tela deriva a lista de
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

export default function ChallengesScreen() {
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
    <ScreenBackground2 style={styles.flex}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.challenge.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerTexts}>
                <Text style={styles.title}>Desafios</Text>
                <Text style={styles.subtitle}>Dos profissionais que voce acompanha</Text>
              </View>
              {canCreate && (
                <Pressable style={styles.createButton} onPress={() => router.push('/challenges/new')}>
                  <Ionicons name="add" size={16} color={colors2.white} />
                  <Text style={styles.createButtonText}>Criar</Text>
                </Pressable>
              )}
            </View>

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
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { padding: spacing2.containerMargin, paddingTop: spacing2.xl, paddingBottom: spacing2.xl },
  header: { gap: spacing2.sm, marginBottom: spacing2.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerTexts: { gap: spacing2.xs, flex: 1 },
  title: { ...typography2.headlineLgMobile, fontSize: 26 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
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
