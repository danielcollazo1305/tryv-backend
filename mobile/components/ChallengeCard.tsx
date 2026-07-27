import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Card } from '@/components/Card';
import { Challenge, formatChallengeDate } from '@/services/challenges';
import { colors, radius, spacing, typography } from '@/constants/theme';

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } })}>
      <Card style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="trophy" size={18} color={colors.accent} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {challenge.title}
          </Text>
          <Text style={styles.dates}>
            {formatChallengeDate(challenge.start_date)} - {formatChallengeDate(challenge.end_date)}
          </Text>
          <Text style={styles.participants}>{challenge.participants_count} participante(s)</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: spacing.xs },
  title: { ...typography.body, fontWeight: '600' },
  dates: { ...typography.caption },
  participants: { ...typography.caption, color: colors.accent },
});
