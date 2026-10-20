import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface PillTabsProps<K extends string> {
  tabs: { key: K; label: string }[];
  selected: K;
  onSelect: (key: K) => void;
}

/**
 * Seletor de abas em pilulas, com o MESMO visual das pilulas do Social (app/(tabs)/feed.tsx: fundo surfaceContainerHigh, selecionada em
 * primary), so que como componente reutilizavel (o do Social e inline na propria tela e nao foi mexido). As pilulas se repartem na largura.
 * Acessibilidade: lista de abas com cada pilula como `tab` e estado selecionado.
 */
export function PillTabs<K extends string>({ tabs, selected, onSelect }: PillTabsProps<K>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {tabs.map(({ key, label }) => {
        const isSelected = key === selected;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={label}
            style={[styles.pill, isSelected && styles.pillSelected]}
          >
            <Text style={[styles.pillText, isSelected && styles.pillTextSelected]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing3.sm, alignSelf: 'stretch' },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  pillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  pillText: { ...typography3.labelSm, fontSize: 12, textTransform: 'none' },
  pillTextSelected: { color: colors3.white, fontFamily: 'Inter_700Bold' },
});
