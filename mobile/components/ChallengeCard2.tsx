import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { Challenge, parseUtcDate } from '@/services/challenges';
import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

function daysRemainingLabel(endDateIso: string): string {
  const diffMs = parseUtcDate(endDateIso).getTime() - Date.now();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Encerrado';
  if (days === 1) return '1 dia restante';
  return `${days} dias restantes`;
}

interface ChallengeCard2Props {
  challenge: Challenge;
  /**
   * 'dark' (padrao) = colors2/LiquiglassCard, usado hoje em
   * trainers/[id].tsx (ainda escura, fora desta migracao). 'light' =
   * colors3/GlassCard, usado em challenges.tsx e
   * challenges/category/[category].tsx (migradas nesta tarefa) — mesmo
   * padrao de variant ja usado em ProfileBadges2/WorkoutDayCard nesta
   * sessao, pra nao afetar o uso que ainda nao migrou.
   */
  variant?: 'dark' | 'light';
}

/**
 * Equivalente do ChallengeCard.tsx pro design novo — por isso versao nova
 * em vez de editar a antiga.
 *
 * Lacunas de dado (nao inventadas): o mockup social-desafios.html mostra
 * uma tag de categoria (ex: "Resistência") e uma barra de "Progresso da
 * Comunidade" (%). O tipo Challenge nao tem nenhum dos dois campos hoje —
 * omitidos aqui.
 */
export function ChallengeCard2({ challenge, variant = 'dark' }: ChallengeCard2Props) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
  const Card = isLight ? GlassCard : LiquiglassCard;
  const ActionButton = isLight ? Button3 : Button2;
  const primaryColor = isLight ? colors3.primary : colors2.primary;
  const dangerColor = isLight ? colors3.error : colors2.danger;

  return (
    <Card style={s.card}>
      <View style={s.iconWatermark}>
        <Ionicons name="trophy" size={56} color={primaryColor} />
      </View>

      <View style={s.headerBlock}>
        <Text style={s.title}>{challenge.title}</Text>
      </View>

      {!!challenge.description && (
        <Text style={s.description} numberOfLines={2}>
          {challenge.description}
        </Text>
      )}

      <View style={s.chipsRow}>
        <View style={s.chip}>
          <Ionicons name="people" size={13} color={primaryColor} />
          <Text style={s.chipText}>{challenge.participants_count} participantes</Text>
        </View>
        <View style={s.chip}>
          <Ionicons name="time" size={13} color={dangerColor} />
          <Text style={s.chipText}>{daysRemainingLabel(challenge.end_date)}</Text>
        </View>
      </View>

      <ActionButton
        label="Ver detalhes"
        variant="secondary"
        onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } })}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md, overflow: 'hidden' },
  iconWatermark: { position: 'absolute', top: spacing2.sm, right: spacing2.sm, opacity: 0.08 },
  headerBlock: { gap: spacing2.xs },
  title: { ...typography2.headlineMd, fontSize: 18 },
  description: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors2.surfaceContainerHigh,
    borderRadius: radius2.pill,
    paddingHorizontal: spacing2.sm,
    paddingVertical: 4,
  },
  chipText: { ...typography2.labelCaps, fontSize: 10, textTransform: 'none' },
});

const stylesLight = StyleSheet.create({
  card: { gap: spacing3.md, overflow: 'hidden' },
  iconWatermark: { position: 'absolute', top: spacing3.sm, right: spacing3.sm, opacity: 0.08 },
  headerBlock: { gap: spacing3.xs },
  title: { ...typography3.headlineMd, fontSize: 18 },
  description: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing3.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors3.surfaceContainerHigh,
    borderRadius: radius3.pill,
    paddingHorizontal: spacing3.sm,
    paddingVertical: 4,
  },
  chipText: { ...typography3.labelSm, fontSize: 10, textTransform: 'none' },
});
