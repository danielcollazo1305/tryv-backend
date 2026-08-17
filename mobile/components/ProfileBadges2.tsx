import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { UserBadges } from '@/services/user';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const PROFESSIONAL_TYPE_LABEL: Record<string, string> = {
  personal_trainer: 'Personal',
  nutritionist: 'Nutri',
};

/**
 * Equivalente do ProfileBadges.tsx pro design novo — mesma API (badges).
 * ProfileBadges original continua em uso em (tabs)/profile.tsx, fora desta
 * migracao — por isso versao nova em vez de editar a antiga.
 */
export function ProfileBadges2({ badges }: { badges: UserBadges | null }) {
  if (!badges || (!badges.is_pro && badges.teams.length === 0)) {
    return null;
  }

  return (
    <View style={styles.row}>
      {badges.is_pro && (
        <View style={[styles.pill, styles.proPill]}>
          <Ionicons name="star" size={12} color={colors2.primary} />
          <Text style={styles.proText}>PRO</Text>
        </View>
      )}
      {badges.teams.map((team) => (
        <View key={`${team.trainer_name}-${team.professional_type}`} style={[styles.pill, styles.teamPill]}>
          <Text style={styles.teamText} numberOfLines={1}>
            TEAM {team.trainer_name.toUpperCase()} ({PROFESSIONAL_TYPE_LABEL[team.professional_type] ?? team.professional_type})
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
    gap: spacing2.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing2.md - 4,
    paddingVertical: 5,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
  },
  proPill: {
    borderColor: 'rgba(208, 188, 255, 0.2)',
  },
  proText: {
    ...typography2.labelCaps,
    color: colors2.primary,
  },
  teamPill: {
    borderColor: colors2.outlineVariant,
  },
  teamText: {
    ...typography2.labelCaps,
    color: colors2.onSurfaceVariant,
  },
});
