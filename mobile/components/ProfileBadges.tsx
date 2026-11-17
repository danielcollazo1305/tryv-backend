import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { UserBadges } from '@/services/user';
import { colors, radius, spacing, typography } from '@/constants/theme';

export function ProfileBadges({ badges }: { badges: UserBadges | null }) {
  if (!badges || !badges.is_pro) {
    return null;
  }

  return (
    <View style={styles.row}>
      {badges.is_pro && (
        <View style={[styles.pill, styles.proPill]}>
          <Ionicons name="star" size={12} color={colors.white} />
          <Text style={styles.proText}>Tryv Fit Pro</Text>
        </View>
      )}
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
});
