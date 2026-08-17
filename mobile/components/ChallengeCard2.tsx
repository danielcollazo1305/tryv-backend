import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { Challenge, parseUtcDate } from '@/services/challenges';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

function daysRemainingLabel(endDateIso: string): string {
  const diffMs = parseUtcDate(endDateIso).getTime() - Date.now();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Encerrado';
  if (days === 1) return '1 dia restante';
  return `${days} dias restantes`;
}

interface ChallengeCard2Props {
  challenge: Challenge;
  /** So exibido quando fornecido (ex: numa listagem que mistura varios profissionais). Omitido quando o contexto ja deixa claro quem criou (ex: dentro do perfil do proprio profissional). */
  creatorName?: string;
  creatorCredential?: string;
}

/**
 * Equivalente do ChallengeCard.tsx pro design novo — API estendida com
 * creatorName/creatorCredential (opcionais) pra cobrir o card da listagem
 * global de desafios, que mistura profissionais diferentes. ChallengeCard
 * original continua em uso em trainers/me.tsx, fora desta migracao — por
 * isso versao nova em vez de editar a antiga.
 *
 * Lacunas de dado (nao inventadas): o mockup social-desafios.html mostra
 * uma tag de categoria (ex: "Resistência") e uma barra de "Progresso da
 * Comunidade" (%). O tipo Challenge nao tem nenhum dos dois campos hoje —
 * omitidos aqui.
 */
export function ChallengeCard2({ challenge, creatorName, creatorCredential }: ChallengeCard2Props) {
  return (
    <LiquiglassCard style={styles.card}>
      <View style={styles.iconWatermark}>
        <Ionicons name="trophy" size={56} color={colors2.primary} />
      </View>

      <View style={styles.headerBlock}>
        <Text style={styles.title}>{challenge.title}</Text>
        {!!creatorName && (
          <View style={styles.creatorRow}>
            <Ionicons name="checkmark-circle" size={13} color={colors2.primary} />
            <Text style={styles.creatorText} numberOfLines={1}>
              Criado por: {creatorName}
              {creatorCredential ? ` — ${creatorCredential}` : ''}
            </Text>
          </View>
        )}
      </View>

      {!!challenge.description && (
        <Text style={styles.description} numberOfLines={2}>
          {challenge.description}
        </Text>
      )}

      <View style={styles.chipsRow}>
        <View style={styles.chip}>
          <Ionicons name="people" size={13} color={colors2.primary} />
          <Text style={styles.chipText}>{challenge.participants_count} participantes</Text>
        </View>
        <View style={styles.chip}>
          <Ionicons name="time" size={13} color={colors2.danger} />
          <Text style={styles.chipText}>{daysRemainingLabel(challenge.end_date)}</Text>
        </View>
      </View>

      <Button2
        label="Ver detalhes"
        variant="secondary"
        onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } })}
      />
    </LiquiglassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md, overflow: 'hidden' },
  iconWatermark: { position: 'absolute', top: spacing2.sm, right: spacing2.sm, opacity: 0.08 },
  headerBlock: { gap: spacing2.xs },
  title: { ...typography2.headlineMd, fontSize: 18 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creatorText: { ...typography2.labelCaps, textTransform: 'none', color: colors2.primary, flexShrink: 1 },
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
