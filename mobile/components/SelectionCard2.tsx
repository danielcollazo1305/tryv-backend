import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface SelectionCard2Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

interface SelectionCard2Props<T extends string> {
  options: SelectionCard2Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/**
 * Cards grandes de selecao unica com indicador circular de check —
 * padrao "option-card" dos mockups de onboarding (step3-objetivo.html
 * etc.), diferente do ChoiceGroup2 (chips compactos numa linha). Nao
 * reaproveitei ChoiceGroup2 porque o formato visual e a densidade sao
 * bem diferentes (card grande empilhado vs. pill inline).
 */
export function SelectionCard2<T extends string>({ options, value, onChange }: SelectionCard2Props<T>) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.card, selected && styles.cardSelected]}
          >
            {!!option.icon && (
              <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                <Ionicons name={option.icon} size={20} color={colors2.primary} />
              </View>
            )}
            <Text style={styles.label}>{option.label}</Text>
            <View style={[styles.check, selected && styles.checkSelected]}>
              {selected && <Ionicons name="checkmark" size={14} color={colors2.white} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing2.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.md,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.md,
    borderRadius: radius2.lg,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    backgroundColor: colors2.surfaceContainer,
  },
  cardSelected: {
    borderColor: colors2.violet,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 3,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: { backgroundColor: 'rgba(139, 92, 246, 0.2)' },
  label: { ...typography2.bodyMd, fontWeight: '600', flex: 1 },
  check: {
    width: 20,
    height: 20,
    borderRadius: radius2.pill,
    borderWidth: 1,
    borderColor: 'rgba(149, 142, 160, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: colors2.violet,
    borderColor: colors2.violet,
  },
});
