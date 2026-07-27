import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
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
import { colors, radius, spacing, typography } from '@/constants/theme';

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
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Desafio</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && challenge && (
          <>
            <Text style={styles.challengeTitle}>{challenge.title}</Text>
            <Text style={styles.dates}>
              {formatChallengeDate(challenge.start_date)} - {formatChallengeDate(challenge.end_date)}
            </Text>

            {!!challenge.description && <Text style={styles.description}>{challenge.description}</Text>}

            <Card style={styles.statsCard}>
              <Text style={styles.statNumber}>{challenge.participants_count}</Text>
              <Text style={styles.statLabel}>participante(s)</Text>
            </Card>

            {joinDenied && (
              <Card style={styles.deniedCard}>
                <Ionicons name="lock-closed" size={20} color={colors.danger} />
                <Text style={styles.deniedText}>Voce precisa ser aluno deste professor para participar.</Text>
                <Button
                  label="Ver perfil do professor"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/trainers/[id]', params: { id: challenge.trainer_id } })
                  }
                />
              </Card>
            )}

            {!!joinError && <Text style={styles.error}>{joinError}</Text>}

            <Button
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
                      <View style={styles.participantAvatar}>
                        <Ionicons name="person" size={14} color={colors.accent} />
                      </View>
                      <Text style={styles.participantName}>{p.name}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  centered: { alignItems: 'center', marginTop: spacing.xl },
  error: { color: colors.danger, textAlign: 'center' },

  challengeTitle: { ...typography.h1 },
  dates: { ...typography.bodySecondary, marginTop: -spacing.xs },
  description: { ...typography.body, color: colors.textSecondary },

  statsCard: { alignItems: 'center', gap: spacing.xs },
  statNumber: { ...typography.statNumber, fontSize: 28 },
  statLabel: { ...typography.statLabel },

  deniedCard: { alignItems: 'center', gap: spacing.sm },
  deniedText: { ...typography.bodySecondary, textAlign: 'center' },

  participantsSection: { gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { ...typography.h3 },
  emptyText: { ...typography.bodySecondary },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  participantAvatar: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantName: { ...typography.bodySecondary, color: colors.text },
});
