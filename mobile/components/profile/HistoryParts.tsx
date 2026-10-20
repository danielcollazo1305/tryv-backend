import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
import { HISTORY_FILTERS, HistoryItem, historyNavTarget, historyRowLabels } from '@/services/profileFeedState';

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  run: 'walk',
  walk: 'walk',
  bike: 'bicycle',
  swim: 'water',
  fight: 'fitness',
  hiit: 'flash',
  workout: 'barbell',
  other: 'ellipse-outline',
};

/** Chips de filtro por modalidade (valores = tipos que o servidor aceita). */
export function HistoryFilterChips({ selectedKey, onSelect }: { selectedKey: string; onSelect: (key: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
      {HISTORY_FILTERS.map((filter) => {
        const selected = filter.key === selectedKey;
        return (
          <Pressable
            key={filter.key}
            onPress={() => onSelect(filter.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`Filtrar: ${filter.label}`}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{filter.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Uma linha do historico. Toca para o detalhe SO se ja existe tela para o tipo (corrida e atividade manual); treino nao navega. */
export function HistoryRow({ item }: { item: HistoryItem }) {
  const labels = historyRowLabels(item);
  const target = historyNavTarget(item);
  const content = (
    <GlassCard variant="card" padding={spacing3.md} style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={ICONS[item.activity_type] ?? 'ellipse-outline'} size={20} color={colors3.primary} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {labels.title}
        </Text>
        <Text style={styles.subtitle}>{labels.subtitle}</Text>
        {!!labels.metrics && <Text style={styles.metrics}>{labels.metrics}</Text>}
      </View>
      {target && <Ionicons name="chevron-forward" size={18} color={colors3.outline} />}
    </GlassCard>
  );
  if (!target) {
    return (
      <View accessible accessibilityLabel={labels.spoken} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => router.push(target)}
      accessibilityRole="button"
      accessibilityLabel={`${labels.spoken}. Abrir detalhes`}
      style={styles.row}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing3.sm, paddingVertical: spacing3.sm },
  chip: {
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.xs + 2,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  chipSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  chipText: { ...typography3.labelSm, fontSize: 12, textTransform: 'none' },
  chipTextSelected: { color: colors3.white, fontFamily: 'Inter_700Bold' },
  row: { marginBottom: spacing3.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius3.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(107, 56, 212, 0.1)',
  },
  texts: { flex: 1, gap: 2 },
  title: { ...typography3.bodyMd, fontFamily: 'Inter_700Bold' },
  subtitle: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant },
  metrics: { ...typography3.bodyMd, fontSize: 13 },
});
