import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { UserBadges } from '@/services/user';
import { colors, radius, spacing, typography } from '@/constants/theme';

const PROFESSIONAL_TYPE_LABEL: Record<string, string> = {
  personal_trainer: 'Personal',
  nutritionist: 'Nutri',
};

export function ProfileBadges({ badges }: { badges: UserBadges | null }) {
  if (!badges || (!badges.is_pro && badges.teams.length === 0)) {
    return null;
  }

  return (
    <View style={styles.row}>
      {badges.is_pro && (
        <View style={[styles.pill, styles.proPill]}>
          <Ionicons name="star" size={12} color={colors.white} />
          <Text style={styles.proText}>Tryv Pro</Text>
        </View>
      )}
      {badges.teams.map((team) => (
        <View key={`${team.trainer_name}-${team.professional_type}`} style={[styles.pill, styles.teamPill]}>
          <Text style={styles.teamText}>
            Team {team.trainer_name} ({PROFESSIONAL_TYPE_LABEL[team.professional_type] ?? team.professional_type})
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  proPill: {
    backgroundColor: colors.accent,
  },
  proText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
  teamPill: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  teamText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
});
