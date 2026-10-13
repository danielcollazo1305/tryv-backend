import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MealDay } from '@/services/meals';
import { dayAccessibilityLabel, dayShortLabel, dayTabLabel, formatKcal } from '@/utils/mealDays';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/** Largura do cartao (pt): no iPhone SE (320) cabem ~2,5 cartoes e o resto convida a rolar. */
export const DAY_CARD_WIDTH = 112;
const CARD_PADDING = 5;
/** Altura do bloco do icone (pt). O esqueleto e o cartao tracejado "Ver todas" usam as mesmas medidas. */
const ICON_BOX_HEIGHT = 56;
/** Altura do corpo: borda+padding (6 por lado) + icone + gap + kcal (20) + gap + meta (16). */
const BODY_HEIGHT = 12 + ICON_BOX_HEIGHT + spacing3.xs + 20 + spacing3.xs + 16;

interface DayCardProps {
  day: MealDay;
  /** 0 = hoje (primeiro item do servidor), 1 = ontem, ... */
  index: number;
  onPress: () => void;
}

/**
 * Cartao "de pasta" de um dia: aba pequena no topo (rotulo), corpo claro com borda, icone de garfo e faca (sem
 * foto; as fotos ficam na lista do dia e em "Ver todas as fotos"), calorias do dia e "dia da semana + numero ·
 * N ref.". Hoje ganha borda de 2 pt e aba na cor primaria. Dia com refeicao: icone cheio roxo; dia sem refeicao:
 * icone vazado cinza e cartao apagado, mas continua tocavel.
 */
export function DayCard({ day, index, onPress }: DayCardProps) {
  const isToday = index === 0;
  const isEmpty = day.meals_count === 0;
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
        <View style={[styles.iconBox, isEmpty ? styles.iconBoxEmpty : styles.iconBoxFilled]}>
          <Ionicons
            name={isEmpty ? 'restaurant-outline' : 'restaurant'}
            size={28}
            color={isEmpty ? colors3.outline : colors3.primary}
          />
        </View>
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
        <View style={[styles.iconBox, styles.skeleton]} />
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
  iconBox: {
    width: '100%',
    height: ICON_BOX_HEIGHT,
    borderRadius: radius3.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxFilled: { backgroundColor: 'rgba(107, 56, 212, 0.16)' },
  iconBoxEmpty: { backgroundColor: colors3.surfaceContainerHigh },
  kcal: { ...typography3.labelMd, fontFamily: 'Inter_700Bold', letterSpacing: 0, color: colors3.onSurface },
  meta: { ...typography3.labelSm, letterSpacing: 0, textTransform: 'none' },

  // paddingTop 21 = aba (22) menos a sobreposicao de 1 pt; minHeight = corpo do cartao do dia
  seeAllWrapper: { width: DAY_CARD_WIDTH - 16, paddingTop: 21 },
  seeAll: {
    flex: 1,
    minHeight: BODY_HEIGHT,
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
  skeletonBody: { opacity: 0.8, minHeight: BODY_HEIGHT },
});
