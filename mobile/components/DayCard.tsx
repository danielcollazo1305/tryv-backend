import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MealDay } from '@/services/meals';
import { dayAccessibilityLabel, dayShortLabel, dayTabLabel, formatKcal } from '@/utils/mealDays';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/** Largura do cartao (pt): no iPhone SE (320) cabem ~2,5 cartoes e o resto convida a rolar. */
export const DAY_CARD_WIDTH = 112;
const CARD_PADDING = 5;

interface DayCardProps {
  day: MealDay;
  /** 0 = hoje (primeiro item do servidor), 1 = ontem, ... */
  index: number;
  onPress: () => void;
}

/**
 * Cartao "de pasta" de um dia: aba pequena no topo (rotulo), corpo claro com borda, foto 4:3 (miniatura quando
 * existe), calorias do dia e "dia da semana + numero · N ref.". Hoje ganha borda de 2 pt e aba na cor primaria. Dia
 * sem refeicao fica apagado mas continua tocavel; dia com refeicao e sem foto mostra o prato no lugar da foto.
 */
export function DayCard({ day, index, onPress }: DayCardProps) {
  const isToday = index === 0;
  const isEmpty = day.meals_count === 0;
  const photo = day.photo_thumb_url ?? day.photo_url;
  const tab = dayTabLabel(day.date, index);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dayAccessibilityLabel(tab, day.total_calories, day.meals_count)}
      style={({ pressed }) => [styles.wrapper, isEmpty && styles.wrapperEmpty, pressed && styles.pressed]}
    >
      <View style={[styles.tab, isToday && styles.tabToday]}>
        <Text style={[styles.tabText, isToday && styles.tabTextToday]} numberOfLines={1}>
          {tab}
        </Text>
      </View>

      <View style={[styles.body, isToday && styles.bodyToday]}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Ionicons name={isEmpty ? 'restaurant-outline' : 'restaurant'} size={22} color={colors3.primary} />
          </View>
        )}
        <Text style={styles.kcal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {formatKcal(day.total_calories)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {dayShortLabel(day.date)} · {day.meals_count} ref.
        </Text>
      </View>
    </Pressable>
  );
}

/** Cartao tracejado no fim da fileira: abre o historico de fotos. */
export function SeeAllCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Ver todas as fotos" style={styles.seeAllWrapper}>
      <View style={styles.seeAll}>
        <Ionicons name="images-outline" size={24} color={colors3.primary} />
        <Text style={styles.seeAllText}>Ver todas</Text>
      </View>
    </Pressable>
  );
}

/** Esqueleto cinza do cartao (carregando). */
export function DayCardSkeleton() {
  return (
    <View style={styles.wrapper}>
      <View style={[styles.tab, styles.skeleton, { width: 44 }]} />
      <View style={[styles.body, styles.skeletonBody]}>
        <View style={[styles.photo, styles.skeleton]} />
        <View style={[styles.skeleton, { height: 14, width: '70%', borderRadius: radius3.sm }]} />
        <View style={[styles.skeleton, { height: 10, width: '55%', borderRadius: radius3.sm }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: DAY_CARD_WIDTH },
  wrapperEmpty: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  tab: {
    alignSelf: 'flex-start',
    marginLeft: spacing3.sm,
    paddingHorizontal: spacing3.sm,
    height: 22,
    justifyContent: 'center',
    borderTopLeftRadius: radius3.md,
    borderTopRightRadius: radius3.md,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors3.outlineVariant,
    // a aba "cola" no corpo: sobrepoe a borda de cima do corpo
    marginBottom: -1,
    zIndex: 1,
  },
  tabToday: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  tabText: { ...typography3.labelSm, fontFamily: 'Inter_700Bold', letterSpacing: 0, color: colors3.onSurfaceVariant },
  tabTextToday: { color: colors3.onPrimary },
  body: {
    borderRadius: radius3.lg,
    borderTopLeftRadius: radius3.sm,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    backgroundColor: colors3.surfaceContainerLowest,
    padding: CARD_PADDING,
    gap: spacing3.xs,
  },
  bodyToday: { borderWidth: 2, borderColor: colors3.primary, padding: CARD_PADDING - 1 },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius3.md,
    backgroundColor: colors3.surfaceVariant,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
  },
  kcal: { ...typography3.labelMd, fontFamily: 'Inter_700Bold', letterSpacing: 0, color: colors3.onSurface },
  meta: { ...typography3.labelSm, letterSpacing: 0, textTransform: 'none' },

  seeAllWrapper: { width: DAY_CARD_WIDTH - 16, paddingTop: 22 },
  seeAll: {
    flex: 1,
    minHeight: 108,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing3.xs,
    borderRadius: radius3.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors3.outline,
  },
  seeAllText: { ...typography3.labelMd, color: colors3.primary },

  skeleton: { backgroundColor: colors3.surfaceContainerHigh },
  skeletonBody: { opacity: 0.8 },
});
