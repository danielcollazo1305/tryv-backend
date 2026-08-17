import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceGroup2Props<T extends string> {
  label: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/**
 * Equivalente do ChoiceGroup.tsx pro design novo — mesma API generica
 * (label/options/value/onChange). ChoiceGroup original continua em uso em
 * meal/add.tsx, social/new.tsx e workout-plan/generate.tsx, que nao fazem
 * parte desta migracao — por isso versao nova em vez de editar a antiga.
 */
export function ChoiceGroup2<T extends string>({ label, options, value, onChange }: ChoiceGroup2Props<T>) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
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
