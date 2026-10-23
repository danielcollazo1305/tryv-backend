import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { MealCoverArt } from '@/components/MealCoverArt';
import { Meal, formatMealTime } from '@/services/meals';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Cartao de uma refeicao. COM foto: a foto grande em 4:3 na largura total, em cima do texto (descricao, horario,
 * kcal e macros embaixo). SEM foto: formato compacto (placeholder de 44 pt ao lado do texto). Usa `photo_url`
 * (a original); se so houver a miniatura, usa ela.
 */
export function MealCard({ meal }: { meal: Meal }) {
  const photo = meal.photo_url ?? meal.photo_thumb_url ?? null;

  const info = (
    <View style={styles.info}>
      <View style={styles.headerRow}>
        <Text style={styles.description} numberOfLines={1}>
          {meal.description ?? 'Refeicao'}
        </Text>
        <Text style={styles.time}>{formatMealTime(meal.logged_at)}</Text>
      </View>

      <Text style={styles.calories}>{Math.round(meal.calories ?? 0)} kcal</Text>

      <View style={styles.macrosRow}>
        <Text style={styles.macro}>P {Math.round(meal.protein ?? 0)}g</Text>
        <Text style={styles.macro}>C {Math.round(meal.carbs ?? 0)}g</Text>
        <Text style={styles.macro}>G {Math.round(meal.fat ?? 0)}g</Text>
      </View>
    </View>
  );

  if (photo) {
    return (
      <GlassCard variant="card" style={styles.cardWithPhoto}>
        <Image source={{ uri: photo }} style={styles.photoLarge} resizeMode="cover" />
        {info}
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="card" style={styles.card}>
      {/* refeicao SEM foto: capa ilustrada (prato roxo); com foto, a foto continua sendo mostrada (acima) */}
      <View style={styles.photoPlaceholder}>
        <MealCoverArt size={44} />
      </View>
      {info}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing3.md,
    alignItems: 'center',
  },
  cardWithPhoto: {
    gap: spacing3.sm,
  },
  photoLarge: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius3.md,
    backgroundColor: colors3.surfaceVariant,
  },
  photoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius3.md,
    overflow: 'hidden',
    backgroundColor: colors3.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: spacing3.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    ...typography3.bodyMd,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
    marginRight: spacing3.sm,
  },
  time: { ...typography3.labelSm, textTransform: 'none' },
  calories: { ...typography3.headlineMd, fontSize: 18 },
  macrosRow: { flexDirection: 'row', gap: spacing3.md },
  macro: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant },
});
