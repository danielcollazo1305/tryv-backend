import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface MultiChoiceGroup2Props<T extends string> {
  label: string;
  options: ChoiceOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
}

/**
 * Irmao multi-select de ChoiceGroup2 — mesmo visual (chips), so troca
 * value/onChange de "um valor" pra "lista de valores com toggle". Extraido
 * como componente separado em vez de mudar a API de ChoiceGroup2 (que tem
 * varios usos de selecao unica ja espalhados pelo app) — os dois
 * continuam coexistindo, cada um pro seu caso.
 */
export function MultiChoiceGroup2<T extends string>({ label, options, value, onChange }: MultiChoiceGroup2Props<T>) {
  const toggle = (optionValue: T) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => toggle(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing2.md,
  },
  label: {
    ...typography2.labelCaps,
    textTransform: 'none',
    marginBottom: spacing2.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing2.sm,
  },
  chip: {
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  chipSelected: {
    backgroundColor: colors2.violet,
    borderColor: colors2.violet,
  },
  chipText: {
    ...typography2.bodyMd,
    fontSize: 14,
    color: colors2.onSurface,
  },
  chipTextSelected: {
    color: colors2.white,
    fontWeight: '700',
  },
});
