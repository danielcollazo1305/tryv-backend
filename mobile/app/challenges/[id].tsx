import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import {
  Challenge,
  formatChallengeDate,
  getChallenge,
  joinChallenge,
  leaveChallenge,
  listChallengeParticipants,
} from '@/services/challenges';
import { UserBrief } from '@/services/social';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';
import { getInitials } from '@/utils/text';

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  // null = nao autorizado a ver a lista (403) — esconde a secao em vez de mostrar erro.
  const [participants, setParticipants] = useState<UserBrief[] | null>(null);
  const [isParticipating, setIsParticipating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinDenied, setJoinDenied] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setChallenge(await getChallenge(id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar este desafio.'));
      setLoading(false);
      return;
    }

    try {
      const participantsData = await listChallengeParticipants(id);
      setParticipants(participantsData);
      setIsParticipating(participantsData.some((p) => p.id === user?.id));
    } catch {
      setParticipants(null);
      setIsParticipating(false);
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

            {!!challenge.description && <Text style={styles.description}>{challenge.description}</Text>}

            <LiquiglassCard style={styles.statsCard}>
              <Text style={styles.statNumber}>{challenge.participants_count}</Text>
              <Text style={styles.statLabel}>participante(s)</Text>
            </LiquiglassCard>

            {joinDenied && (
              <LiquiglassCard style={styles.deniedCard}>
                <Ionicons name="lock-closed" size={20} color={colors2.danger} />
                <Text style={styles.deniedText}>Voce precisa ser aluno deste professor para participar.</Text>
                <Button2
                  label="Ver perfil do professor"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/trainers/[id]', params: { id: challenge.trainer_id } })
                  }
                />
              </LiquiglassCard>
            )}

            {!!joinError && <Text style={styles.error}>{joinError}</Text>}

            <Button2
              label={isParticipating ? 'Sair' : 'Participar'}
              variant={isParticipating ? 'secondary' : 'primary'}
              onPress={isParticipating ? handleLeave : handleJoin}
              loading={joining}
            />

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

  statsCard: { alignItems: 'center', gap: spacing2.xs },
  statNumber: { ...typography2.metricMono, fontSize: 28 },
  statLabel: { ...typography2.labelCaps },

  deniedCard: { alignItems: 'center', gap: spacing2.sm },
  deniedText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant, textAlign: 'center' },

  participantsSection: { gap: spacing2.sm, marginTop: spacing2.md },
  sectionTitle: { ...typography2.headlineMd, fontSize: 18 },
  emptyText: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  participantName: { ...typography2.bodyMd, fontSize: 14 },
});
