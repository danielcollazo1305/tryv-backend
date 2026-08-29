import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { UserBadges } from '@/services/user';
import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

const PROFESSIONAL_TYPE_LABEL: Record<string, string> = {
  personal_trainer: 'Personal',
  nutritionist: 'Nutri',
};

interface ProfileBadges2Props {
  badges: UserBadges | null;
  /**
   * 'dark' (padrao) = colors2/liquiglass, usado hoje em social/[userId].tsx
   * e settings/badges.tsx. 'light' = colors3/prism-glass, so pro Perfil
   * proprio (ja migrado) — mesmo padrao de variant ja usado em
   * EmptyFollowingState/ObscuredCard/TextField2/PostGrid2 nesta sessao, pra
   * nao afetar os 2 outros usos que ainda nao migraram.
   */
  variant?: 'dark' | 'light';
}

/**
 * Equivalente do ProfileBadges.tsx pro design novo — mesma API (badges).
 * ProfileBadges original continua em uso em (tabs)/profile.tsx, fora desta
 * migracao — por isso versao nova em vez de editar a antiga.
 */
export function ProfileBadges2({ badges, variant = 'dark' }: ProfileBadges2Props) {
  if (!badges || (!badges.is_pro && badges.teams.length === 0)) {
    return null;
  }
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;

  return (
    <View style={s.row}>
      {badges.is_pro && (
        <View style={[s.pill, s.proPill]}>
          <Ionicons name="star" size={12} color={isLight ? colors3.primary : colors2.primary} />
          <Text style={s.proText}>PRO</Text>
        </View>
      )}
      {badges.teams.map((team) => (
        <View key={`${team.trainer_name}-${team.professional_type}`} style={[s.pill, s.teamPill]}>
          <Text style={s.teamText} numberOfLines={1}>
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

const stylesLight = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing3.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing3.md - 4,
    paddingVertical: 5,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
  },
  proPill: {
    borderColor: 'rgba(107, 56, 212, 0.2)',
  },
  proText: {
    ...typography3.labelSm,
    textTransform: 'none',
    color: colors3.primary,
    fontWeight: '700',
  },
  teamPill: {
    borderColor: colors3.outlineVariant,
  },
  teamText: {
    ...typography3.labelSm,
    textTransform: 'none',
    color: colors3.onSurfaceVariant,
  },
});
