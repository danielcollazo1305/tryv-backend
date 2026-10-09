import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DayCard, DayCardSkeleton, SeeAllCard } from '@/components/DayCard';
import { MealDay } from '@/services/meals';
import { colors3, spacing3, typography3 } from '@/constants/theme';

interface DayStripProps {
  /** null enquanto carrega pela primeira vez. */
  days: MealDay[] | null;
  onPressDay: (day: MealDay) => void;
  onPressSeeAll: () => void;
}

/**
 * Secao "Ultimos 7 dias": titulo + link "Ver todas as fotos" e uma fileira horizontal rolavel (sem barra), HOJE a
 * esquerda e os dias anteriores a direita, terminando num cartao tracejado "Ver todas". A fileira vai de borda a
 * borda da tela (o pai tem padding horizontal): margem negativa + padding no conteudo da rolagem.
 * Em erro de rede o pai simplesmente nao renderiza este componente.
 */
export function DayStrip({ days, onPressDay, onPressSeeAll }: DayStripProps) {
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Últimos 7 dias</Text>
        <Pressable onPress={onPressSeeAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ver todas as fotos">
          <Text style={styles.link}>Ver todas as fotos</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {days === null
          ? Array.from({ length: 7 }, (_, i) => <DayCardSkeleton key={i} />)
          : days.map((day, index) => (
              <DayCard key={day.date} day={day} index={index} onPress={() => onPressDay(day)} />
            ))}
        {days !== null && <SeeAllCard onPress={onPressSeeAll} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing3.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography3.headlineMd, fontSize: 18 },
  link: { ...typography3.labelMd, color: colors3.primary },
  scroll: { marginHorizontal: -spacing3.containerMargin },
  scrollContent: {
    paddingHorizontal: spacing3.containerMargin,
    paddingBottom: spacing3.xs,
    gap: spacing3.sm,
    alignItems: 'flex-start',
  },
});
