import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button2 } from '@/components/Button2';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { HeatmapDay, HeatmapGrid, computeCurrentStreak, todayKey } from '@/components/HeatmapGrid';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import {
  Challenge,
  buildAutomaticChallengeHeatmapDays,
  buildChallengeHeatmapDays,
  createChallengeCheckin,
  describeChallengeGoal,
  formatChallengeDate,
  getChallenge,
  getChallengeProgress,
  joinChallenge,
  leaveChallenge,
  listChallengeParticipants,
  listMyChallengeCheckins,
} from '@/services/challenges';
import { uploadMedia } from '@/services/media';
import { SHARE_VISIBILITY_OPTIONS, ShareVisibility, UserBrief, createPost } from '@/services/social';
import { TrainerPublic, getTrainer, licenseLabel } from '@/services/trainers';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

const CATEGORY_LABEL: Record<string, string> = {
  musculacao_corrida: 'Musculação/Corrida',
  alimentacao: 'Alimentação',
};

const PROFESSIONAL_TYPE_LABEL: Record<string, string> = {
  personal_trainer: 'Personal Trainer',
  nutritionist: 'Nutricionista',
};

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [creatorTrainer, setCreatorTrainer] = useState<TrainerPublic | null>(null);
  // null = nao autorizado a ver a lista (403) — esconde a secao em vez de mostrar erro.
  const [participants, setParticipants] = useState<UserBrief[] | null>(null);
  const [isParticipating, setIsParticipating] = useState(false);
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinDenied, setJoinDenied] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [checkinPhotoUri, setCheckinPhotoUri] = useState<string | null>(null);
  const [checkinVisibility, setCheckinVisibility] = useState<ShareVisibility>('none');
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    let loadedChallenge: Challenge;
    try {
      loadedChallenge = await getChallenge(id);
      setChallenge(loadedChallenge);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar este desafio.'));
      setLoading(false);
      return;
    }

    if (loadedChallenge.trainer_id) {
      getTrainer(loadedChallenge.trainer_id)
        .then(setCreatorTrainer)
        .catch(() => setCreatorTrainer(null));
    } else {
      setCreatorTrainer(null);
    }

    let participating = false;
    try {
      const participantsData = await listChallengeParticipants(id);
      setParticipants(participantsData);
      participating = participantsData.some((p) => p.id === user?.id);
      setIsParticipating(participating);
    } catch {
      setParticipants(null);
      // 403 tambem acontece quando a pessoa NAO participa (ver
      // list_participants no backend) — nesse caso permanece false, ja e o
      // valor inicial.
    }

    if (participating) {
      try {
        setHeatmapDays(
          loadedChallenge.goal_type === 'manual'
            ? buildChallengeHeatmapDays(loadedChallenge, await listMyChallengeCheckins(id))
            : buildAutomaticChallengeHeatmapDays(loadedChallenge, await getChallengeProgress(id))
        );
      } catch {
        setHeatmapDays([]);
      }
    } else {
      setHeatmapDays([]);
    }

    setLoading(false);
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const handleJoin = async () => {
    if (!id) return;
    setJoining(true);
    setJoinError(null);
    setJoinDenied(false);
    try {
      await joinChallenge(id);
      await fetchAll();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setJoinDenied(true);
      } else {
        setJoinError(getApiErrorMessage(err, 'Nao foi possivel entrar no desafio.'));
      }
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!id) return;
    setJoining(true);
    setJoinError(null);
    try {
      await leaveChallenge(id);
      await fetchAll();
    } catch (err) {
      setJoinError(getApiErrorMessage(err, 'Nao foi possivel sair do desafio.'));
    } finally {
      setJoining(false);
    }
  };

  const handleTakeCheckinPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setCheckinError('Permissao de camera negada. Habilite nas configuracoes do celular.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3] });
    if (!result.canceled && result.assets[0]) setCheckinPhotoUri(result.assets[0].uri);
  };

  const handlePickCheckinPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setCheckinError('Permissao de galeria negada. Habilite nas configuracoes do celular.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) setCheckinPhotoUri(result.assets[0].uri);
  };

  const handleCheckin = async () => {
    if (!id || !challenge) return;
    setCheckinSaving(true);
    setCheckinError(null);
    try {
      let photoUrl: string | null = null;
      if (checkinPhotoUri) {
        photoUrl = await uploadMedia(checkinPhotoUri, 'challenges');
      }
      await createChallengeCheckin(id, {
        photo_url: photoUrl,
        shared_publicly: checkinVisibility !== 'none',
      });

      // Mesmo padrao "fire and forget" de meal/add.tsx — o check-in ja foi
      // salvo com sucesso, uma falha so ao publicar no Feed nao deve
      // travar nem desfazer o check-in.
      if (checkinVisibility !== 'none') {
        createPost({
          type: photoUrl ? 'photo' : 'achievement',
          caption: `Check-in do desafio: ${challenge.title}`,
          media_url: photoUrl,
          visibility: checkinVisibility,
        }).catch(() => {});
      }

      setCheckinPhotoUri(null);
      setCheckinVisibility('none');
      await fetchAll();
    } catch (err) {
      setCheckinError(getApiErrorMessage(err, 'Nao foi possivel registrar seu check-in.'));
    } finally {
      setCheckinSaving(false);
    }
  };

  // Funciona pros 2 casos (checkin manual real ou progresso automatico
  // calculado) porque heatmapDays ja reflete a fonte certa desde o fetch —
  // so olha se a celula de hoje tem intensidade (fez/bateu a meta).
  const hasCheckedInToday = (heatmapDays.find((d) => d.date === todayKey())?.intensity ?? 0) > 0;
  // buildChallengeHeatmapDays/buildAutomaticChallengeHeatmapDays cobrem
  // sempre o periodo inteiro do desafio (start_date ate hoje/end_date) —
  // diferente da Frequencia de Treino (janela de 1 mes civil), aqui
  // hitLeftEdge=true so significa "a sequencia cobre o desafio inteiro ate
  // agora", um numero exato, nao um piso — por isso nao mostra "+"
  // (comparar com TrainingFrequencyCard).
  const consistencyStreak = computeCurrentStreak(heatmapDays, todayKey());
  const creatorLabel = creatorTrainer
    ? PROFESSIONAL_TYPE_LABEL[creatorTrainer.professional_type] ?? creatorTrainer.professional_type
    : null;

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Desafio</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors2.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors2.violet} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && challenge && (
          <>
            <View style={styles.titleBlock}>
              <Ionicons name="trophy" size={22} color={colors2.primary} />
              <Text style={styles.challengeTitle}>{challenge.title}</Text>
            </View>
            <Text style={styles.dates}>
              {formatChallengeDate(challenge.start_date)} - {formatChallengeDate(challenge.end_date)}
            </Text>

            <View style={styles.tagsRow}>
              {challenge.is_official ? (
                <View style={styles.tag}>
                  <Ionicons name="shield-checkmark" size={13} color={colors2.primary} />
                  <Text style={styles.tagText}>Desafio oficial Tryv</Text>
                </View>
              ) : (
                creatorTrainer && (
                  <View style={styles.tag}>
                    <Ionicons name="checkmark-circle" size={13} color={colors2.primary} />
                    <Text style={styles.tagText} numberOfLines={1}>
                      Desafio de {creatorTrainer.user_name} — {creatorLabel} (
                      {licenseLabel(creatorTrainer.professional_type)} {creatorTrainer.license_number})
                    </Text>
                  </View>
                )
              )}
              {!!challenge.category && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{CATEGORY_LABEL[challenge.category] ?? challenge.category}</Text>
                </View>
              )}
            </View>

            {!!challenge.description && <Text style={styles.description}>{challenge.description}</Text>}

            <View style={styles.statsRow}>
              <LiquiglassCard style={styles.statTile}>
                <Text style={styles.statNumber}>{challenge.participants_count}</Text>
                <Text style={styles.statLabel}>Participantes</Text>
              </LiquiglassCard>
              <LiquiglassCard style={styles.statTile}>
                <Text style={styles.statNumber}>{challenge.community_progress_percent}%</Text>
                <Text style={styles.statLabel}>Fizeram check-in hoje</Text>
              </LiquiglassCard>
            </View>

            {joinDenied && (
              <LiquiglassCard style={styles.deniedCard}>
                <Ionicons name="lock-closed" size={20} color={colors2.danger} />
                <Text style={styles.deniedText}>Voce precisa ser aluno deste professor para participar.</Text>
                {!!challenge.trainer_id && (
                  <Button2
                    label="Ver perfil do professor"
                    variant="secondary"
                    onPress={() =>
                      router.push({ pathname: '/trainers/[id]', params: { id: challenge.trainer_id! } })
                    }
                  />
                )}
              </LiquiglassCard>
            )}

            {!!joinError && <Text style={styles.error}>{joinError}</Text>}

            <Button2
              label={isParticipating ? 'Sair' : 'Participar'}
              variant={isParticipating ? 'secondary' : 'primary'}
              onPress={isParticipating ? handleLeave : handleJoin}
              loading={joining}
            />

            {isParticipating && (
              <>
                {challenge.goal_type !== 'manual' ? (
                  // Metas automaticas nao usam check-in manual — o proprio
                  // heatmap abaixo ja reflete o progresso calculado a
                  // partir de Refeicoes/Corridas/Sessoes de treino, sem
                  // acao nenhuma da pessoa. Mostrar o botao "Fiz hoje" aqui
                  // seria enganoso (nao teria efeito nenhum no progresso).
                  <LiquiglassCard style={styles.checkinDoneCard}>
                    <Ionicons
                      name={hasCheckedInToday ? 'checkmark-circle' : 'information-circle'}
                      size={22}
                      color={colors2.violet}
                    />
                    <Text style={styles.checkinDoneText}>{describeChallengeGoal(challenge)}</Text>
                  </LiquiglassCard>
                ) : hasCheckedInToday ? (
                  <LiquiglassCard style={styles.checkinDoneCard}>
                    <Ionicons name="checkmark-circle" size={22} color={colors2.violet} />
                    <Text style={styles.checkinDoneText}>Voce ja fez check-in hoje!</Text>
                  </LiquiglassCard>
                ) : (
                  <LiquiglassCard style={styles.checkinCard}>
                    <Text style={styles.sectionTitle}>Check-in de hoje</Text>

                    {checkinPhotoUri && <Image source={{ uri: checkinPhotoUri }} style={styles.checkinPreview} />}

                    <View style={styles.checkinPhotoButtons}>
                      <Pressable style={styles.checkinPhotoButton} onPress={handleTakeCheckinPhoto}>
                        <Ionicons name="camera" size={18} color={colors2.primary} />
                        <Text style={styles.checkinPhotoButtonText}>Tirar foto</Text>
                      </Pressable>
                      <Pressable style={styles.checkinPhotoButton} onPress={handlePickCheckinPhoto}>
                        <Ionicons name="images" size={18} color={colors2.primary} />
                        <Text style={styles.checkinPhotoButtonText}>Galeria</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.checkinHint}>Foto e opcional.</Text>

                    <ChoiceGroup2
                      label="Compartilhar no Feed"
                      options={SHARE_VISIBILITY_OPTIONS}
                      value={checkinVisibility}
                      onChange={setCheckinVisibility}
                    />

                    {!!checkinError && <Text style={styles.error}>{checkinError}</Text>}

                    <Button2 label="Fiz hoje" onPress={handleCheckin} loading={checkinSaving} />
                  </LiquiglassCard>
                )}

                <LiquiglassCard style={styles.heatmapCard}>
                  <View style={styles.heatmapHeader}>
                    <Text style={styles.sectionTitle}>Sua consistencia</Text>
                    {consistencyStreak.count > 0 && (
                      <View style={styles.streakBadge}>
                        <Ionicons name="flame" size={14} color={colors2.violet} />
                        <Text style={styles.streakText}>
                          {consistencyStreak.count} {consistencyStreak.count === 1 ? 'dia seguido' : 'dias seguidos'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <HeatmapGrid days={heatmapDays} todayKey={todayKey()} />
                </LiquiglassCard>
              </>
            )}

            {participants !== null && (
              <View style={styles.participantsSection}>
                <Text style={styles.sectionTitle}>Participantes</Text>
                {participants.length === 0 ? (
                  <Text style={styles.emptyText}>Ninguem entrou ainda.</Text>
                ) : (
                  participants.map((p) => (
                    <View key={p.id} style={styles.participantRow}>
                      <Avatar initials={getInitials(p.name)} size={28} />
                      <Text style={styles.participantName}>{p.name}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
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
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.md },
  centered: { alignItems: 'center', marginTop: spacing2.xl },
  error: { color: colors2.danger, textAlign: 'center' },

  titleBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  challengeTitle: { ...typography2.headlineLgMobile, fontSize: 24, flexShrink: 1 },
  dates: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: -spacing2.xs },
  description: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing2.md - 4,
    paddingVertical: 5,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.2)',
    maxWidth: '100%',
  },
  tagText: { ...typography2.labelCaps, textTransform: 'none', color: colors2.primary, flexShrink: 1 },

  statsRow: { flexDirection: 'row', gap: spacing2.sm },
  statTile: { flex: 1, alignItems: 'center', gap: spacing2.xs },
  statNumber: { ...typography2.metricMono, fontSize: 24 },
  statLabel: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant, textAlign: 'center' },

  deniedCard: { alignItems: 'center', gap: spacing2.sm },
  deniedText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant, textAlign: 'center' },

  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },

  checkinCard: { gap: spacing2.sm },
  checkinPreview: { width: '100%', height: 160, borderRadius: radius2.md, backgroundColor: colors2.surfaceContainerHigh },
  checkinPhotoButtons: { flexDirection: 'row', gap: spacing2.sm },
  checkinPhotoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.xs,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.md,
    paddingVertical: spacing2.sm,
  },
  checkinPhotoButtonText: { ...typography2.bodyMd, fontSize: 13 },
  checkinHint: { ...typography2.bodyMd, fontSize: 12, fontStyle: 'italic', color: colors2.onSurfaceVariant },

  checkinDoneCard: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  checkinDoneText: { ...typography2.bodyMd, fontWeight: '600' },

  heatmapCard: { gap: spacing2.md },
  heatmapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderRadius: 999,
    paddingHorizontal: spacing2.sm,
    paddingVertical: 4,
  },
  streakText: { ...typography2.labelCaps, textTransform: 'none', fontSize: 11, color: colors2.violet, fontWeight: '700' },

  participantsSection: { gap: spacing2.sm, marginTop: spacing2.md },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  participantName: { ...typography2.bodyMd, fontSize: 14 },
});
