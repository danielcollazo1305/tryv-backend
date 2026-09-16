import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceGroup2Props<T extends string> {
  label: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /**
   * 'dark' (padrao) = colors2, usado hoje pelas telas escuras que ainda
   * consomem esse componente (challenges/[id], activity/new, meal/add,
   * social/new, trainers/students/[studentId]/workout-plan, trainers/
   * register). 'light' = colors3, so pelas 6 telas de onboarding de cadastro
   * (register-frequency.tsx etc., migradas pro tema claro "prism-glass") —
   * mesmo padrao de variant ja usado em SelectionCard2/ProgressSteps2/
   * TextField2, pra nao quebrar os consumidores ainda escuros.
   */
  variant?: 'dark' | 'light';
}

/**
 * Equivalente do ChoiceGroup.tsx pro design novo — mesma API generica
 * (label/options/value/onChange). ChoiceGroup original continua em uso em
 * meal/add.tsx, social/new.tsx e workout-plan/generate.tsx, que nao fazem
 * parte desta migracao — por isso versao nova em vez de editar a antiga.
 */
export function ChoiceGroup2<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'dark',
}: ChoiceGroup2Props<T>) {
  const s = variant === 'light' ? stylesLight : styles;

  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      <View style={s.optionsRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[s.chip, selected && s.chipSelected]}
            >
              <Text style={[s.chipText, selected && s.chipTextSelected]}>{option.label}</Text>
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

const stylesLight = StyleSheet.create({
  container: {
    marginBottom: spacing3.md,
  },
  label: {
    ...typography3.labelSm,
    textTransform: 'none',
    marginBottom: spacing3.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing3.sm,
  },
  chip: {
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
  },
  chipSelected: {
    backgroundColor: colors3.primary,
    borderColor: colors3.primary,
  },
  chipText: {
    ...typography3.bodyMd,
    fontSize: 14,
    color: colors3.onSurface,
  },
  chipTextSelected: {
    color: colors3.onPrimary,
    fontFamily: 'Inter_700Bold',
  },
});
