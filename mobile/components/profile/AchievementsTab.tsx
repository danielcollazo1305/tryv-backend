import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { ProfileBadges2 } from '@/components/ProfileBadges2';
import { colors3, spacing3, typography3 } from '@/constants/theme';
import type { UserBadges } from '@/services/user';

interface AchievementsTabProps {
  badges: UserBadges | null;
  /** Sequencia atual e melhor sequencia (de GET /dashboard/training-streaks, ja carregados pela tela de perfil); null = ainda sem dado. */
  currentStreak: number | null;
  bestStreak: number | null;
}

const days = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/**
 * Aba Conquistas do SEU perfil. O app so tem, de verdade, os selos Pro/Team (getUserBadges, mesmos dados da tela "Meus selos e conquistas") e as
 * sequencias de treino; nao ha uma lista de medalhas por recorde. "Ver todas" leva a tela que ja existe (settings/badges). O selo Team continua
 * escondido (marketplace de profissionais desativado, como ja era no perfil).
 */
export function AchievementsTab({ badges, currentStreak, bestStreak }: AchievementsTabProps) {
  return (
    <View style={styles.box}>
      <GlassCard variant="card" padding={spacing3.md} style={styles.card}>
        <Text style={styles.sectionTitle}>Selos</Text>
        <ProfileBadges2 badges={badges ? { ...badges, teams: [] } : badges} variant="light" />
        <Text style={styles.muted}>{badges?.is_pro ? 'Você é Tryv Fit Pro.' : 'Assine o Tryv Fit Pro para ganhar o selo Pro.'}</Text>
      </GlassCard>

      <GlassCard variant="card" padding={spacing3.md} style={styles.card}>
        <Text style={styles.sectionTitle}>Sequências de treino</Text>
        <View style={styles.row} accessible accessibilityLabel={`Sequência atual: ${currentStreak != null ? days(currentStreak) : 'sem dado'}`}>
          <Ionicons name="flash" size={18} color={colors3.primary} />
          <Text style={styles.rowLabel}>Sequência atual</Text>
          <Text style={styles.rowValue}>{currentStreak != null ? days(currentStreak) : '--'}</Text>
        </View>
        <View style={styles.row} accessible accessibilityLabel={`Melhor sequência: ${bestStreak != null ? days(bestStreak) : 'sem dado'}`}>
          <Ionicons name="trophy" size={18} color={colors3.primary} />
          <Text style={styles.rowLabel}>Melhor sequência</Text>
          <Text style={styles.rowValue}>{bestStreak != null ? days(bestStreak) : '--'}</Text>
        </View>
      </GlassCard>

      <Pressable onPress={() => router.push('/settings/badges')} accessibilityRole="button" accessibilityLabel="Ver todos os selos e conquistas">
        <GlassCard variant="card" padding={spacing3.md} style={styles.seeAll}>
          <Ionicons name="ribbon" size={20} color={colors3.primary} />
          <Text style={styles.seeAllText}>Ver todas</Text>
          <Ionicons name="chevron-forward" size={18} color={colors3.outline} />
        </GlassCard>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: spacing3.md },
  card: { gap: spacing3.sm },
  sectionTitle: { ...typography3.headlineMd, fontSize: 16 },
  muted: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm, minHeight: 32 },
  rowLabel: { ...typography3.bodyMd, flex: 1 },
  rowValue: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  seeAllText: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold', flex: 1 },
});
