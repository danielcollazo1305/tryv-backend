import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button3 } from '@/components/Button3';
// ChoiceGroup2 continua escuro de proposito — compartilhado com ~20 outras
// telas ainda nao migradas (mesmo caso ja documentado na migracao de
// Refeicoes: TextField2/ChoiceGroup2 ficam pra depois). Nao faz parte desta
// tarefa (so ChallengeCard2 foi pedido).
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { GlassCard } from '@/components/GlassCard';
import { HeatmapDay, HeatmapGrid, computeCurrentStreak, todayKey } from '@/components/HeatmapGrid';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
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
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

const CATEGORY_LABEL: Record<string, string> = {
  musculacao_corrida: 'Musculação/Corrida',
  alimentacao: 'Alimentação',
};

const PROFESSIONAL_TYPE_LABEL: Record<string, string> = {
  personal_trainer: 'Personal Trainer',
  nutritionist: 'Nutricionista',
};

/**
 * Migrado pro tema claro "prism-glass" nesta tarefa (ScreenBackground2 ->
 * ScreenBackground3, LiquiglassCard -> GlassCard, Button2 -> Button3,
 * colors2 -> colors3) — mockup aprovado "Tryv Desafio Detalhe". So troca de
 * tokens/componentes visuais, nenhuma logica de goal_type/check-in/
 * participacao foi alterada. HeatmapGrid ganhou variant="light" (ja
 * suportado pelo componente).
 */
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
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Desafio</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors3.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors3.primary} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && challenge && (
          <>
            <View style={styles.titleBlock}>
              <Ionicons name="trophy" size={22} color={colors3.primary} />
              <Text style={styles.challengeTitle}>{challenge.title}</Text>
            </View>
            <Text style={styles.dates}>
              {formatChallengeDate(challenge.start_date)} - {formatChallengeDate(challenge.end_date)}
            </Text>

            <View style={styles.tagsRow}>
              {challenge.is_official ? (
                <View style={styles.tag}>
                  <Ionicons name="shield-checkmark" size={13} color={colors3.primary} />
                  <Text style={styles.tagText}>Desafio oficial Tryv</Text>
                </View>
              ) : (
                creatorTrainer && (
                  <View style={styles.tag}>
                    <Ionicons name="checkmark-circle" size={13} color={colors3.primary} />
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
              <GlassCard variant="card" style={styles.statTile}>
                <Text style={styles.statNumber}>{challenge.participants_count}</Text>
                <Text style={styles.statLabel}>Participantes</Text>
              </GlassCard>
              <GlassCard variant="card" style={styles.statTile}>
                <Text style={styles.statNumber}>{challenge.community_progress_percent}%</Text>
                <Text style={styles.statLabel}>Fizeram check-in hoje</Text>
              </GlassCard>
            </View>

            {joinDenied && (
              <GlassCard variant="card" style={styles.deniedCard}>
                <Ionicons name="lock-closed" size={20} color={colors3.error} />
                <Text style={styles.deniedText}>Voce precisa ser aluno deste professor para participar.</Text>
                {!!challenge.trainer_id && (
                  <Button3
                    label="Ver perfil do professor"
                    variant="secondary"
                    onPress={() =>
                      router.push({ pathname: '/trainers/[id]', params: { id: challenge.trainer_id! } })
                    }
                  />
                )}
              </GlassCard>
            )}

            {!!joinError && <Text style={styles.error}>{joinError}</Text>}

            <Button3
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
                  <GlassCard variant="card" style={styles.checkinDoneCard}>
                    <Ionicons
                      name={hasCheckedInToday ? 'checkmark-circle' : 'information-circle'}
                      size={22}
                      color={colors3.primary}
                    />
                    <Text style={styles.checkinDoneText}>{describeChallengeGoal(challenge)}</Text>
                  </GlassCard>
                ) : hasCheckedInToday ? (
                  <GlassCard variant="card" style={styles.checkinDoneCard}>
                    <Ionicons name="checkmark-circle" size={22} color={colors3.primary} />
                    <Text style={styles.checkinDoneText}>Voce ja fez check-in hoje!</Text>
                  </GlassCard>
                ) : (
                  <GlassCard variant="card" style={styles.checkinCard}>
                    <Text style={styles.sectionTitle}>Check-in de hoje</Text>

                    {checkinPhotoUri && <Image source={{ uri: checkinPhotoUri }} style={styles.checkinPreview} />}

                    <View style={styles.checkinPhotoButtons}>
                      <Pressable style={styles.checkinPhotoButton} onPress={handleTakeCheckinPhoto}>
                        <Ionicons name="camera" size={18} color={colors3.primary} />
                        <Text style={styles.checkinPhotoButtonText}>Tirar foto</Text>
                      </Pressable>
                      <Pressable style={styles.checkinPhotoButton} onPress={handlePickCheckinPhoto}>
                        <Ionicons name="images" size={18} color={colors3.primary} />
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

                    <Button3 label="Fiz hoje" onPress={handleCheckin} loading={checkinSaving} />
                  </GlassCard>
                )}

                <GlassCard variant="card" style={styles.heatmapCard}>
                  <View style={styles.heatmapHeader}>
                    <Text style={styles.sectionTitle}>Sua consistencia</Text>
                    {consistencyStreak.count > 0 && (
                      <View style={styles.streakBadge}>
                        <Ionicons name="flame" size={14} color={colors3.primary} />
                        <Text style={styles.streakText}>
                          {consistencyStreak.count} {consistencyStreak.count === 1 ? 'dia seguido' : 'dias seguidos'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <HeatmapGrid days={heatmapDays} todayKey={todayKey()} variant="light" />
                </GlassCard>
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
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.md },
  centered: { alignItems: 'center', marginTop: spacing3.xl },
  error: { color: colors3.error, textAlign: 'center' },

  titleBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  challengeTitle: { ...typography3.headlineLgMobile, fontSize: 24, flexShrink: 1 },
  dates: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: -spacing3.xs },
  description: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing3.md - 4,
    paddingVertical: 5,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.18)',
    maxWidth: '100%',
  },
  tagText: { ...typography3.labelSm, textTransform: 'none', color: colors3.primary, flexShrink: 1 },

  statsRow: { flexDirection: 'row', gap: spacing3.sm },
  statTile: { flex: 1, alignItems: 'center', gap: spacing3.xs },
  statNumber: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 24, color: colors3.onSurface },
  statLabel: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, textAlign: 'center' },

  deniedCard: { alignItems: 'center', gap: spacing3.sm },
  deniedText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant, textAlign: 'center' },

  sectionTitle: { ...typography3.headlineMd, fontSize: 18 },

  checkinCard: { gap: spacing3.sm },
  checkinPreview: { width: '100%', height: 160, borderRadius: radius3.md, backgroundColor: colors3.surfaceContainerHigh },
  checkinPhotoButtons: { flexDirection: 'row', gap: spacing3.sm },
  checkinPhotoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing3.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.md,
    paddingVertical: spacing3.sm,
  },
  checkinPhotoButtonText: { ...typography3.bodyMd, fontSize: 13 },
  checkinHint: { ...typography3.bodyMd, fontSize: 12, fontStyle: 'italic', color: colors3.onSurfaceVariant },

  checkinDoneCard: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  checkinDoneText: { ...typography3.bodyMd, fontWeight: '600' },

  heatmapCard: { gap: spacing3.md },
  heatmapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    borderRadius: 999,
    paddingHorizontal: spacing3.sm,
    paddingVertical: 4,
  },
  streakText: { ...typography3.labelSm, textTransform: 'none', fontSize: 11, color: colors3.primary, fontWeight: '700' },

  participantsSection: { gap: spacing3.sm, marginTop: spacing3.md },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  participantName: { ...typography3.bodyMd, fontSize: 14 },
});
