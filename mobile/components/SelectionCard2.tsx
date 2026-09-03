import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

interface SelectionCard2Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

interface SelectionCard2Props<T extends string> {
  options: SelectionCard2Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /**
   * 'dark' (padrao) = colors2, usado hoje pelas 6 telas de onboarding
   * (register-goal.tsx e as outras do fluxo de cadastro). 'light' = colors3,
   * so pro formulario de gerar treino (workout-plan/generate.tsx, migrado
   * nesta tarefa) — mesmo padrao de variant ja usado em TextField2/
   * WorkoutPlanView, pra nao quebrar os consumidores ainda escuros.
   */
  variant?: 'dark' | 'light';
}

/**
 * Cards grandes de selecao unica com indicador circular de check —
 * padrao "option-card" dos mockups de onboarding (step3-objetivo.html
 * etc.), diferente do ChoiceGroup2 (chips compactos numa linha). Nao
 * reaproveitei ChoiceGroup2 porque o formato visual e a densidade sao
 * bem diferentes (card grande empilhado vs. pill inline).
 */
export function SelectionCard2<T extends string>({
  options,
  value,
  onChange,
  variant = 'dark',
}: SelectionCard2Props<T>) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
  const iconColor = isLight ? colors3.primary : colors2.primary;
  const checkColor = isLight ? colors3.white : colors2.white;

  return (
    <View style={s.container}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[s.card, selected && s.cardSelected]}
          >
            {!!option.icon && (
              <View style={[s.iconWrap, selected && s.iconWrapSelected]}>
                <Ionicons name={option.icon} size={20} color={iconColor} />
              </View>
            )}
            <Text style={s.label}>{option.label}</Text>
            <View style={[s.check, selected && s.checkSelected]}>
              {selected && <Ionicons name="checkmark" size={14} color={checkColor} />}
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

const stylesLight = StyleSheet.create({
  container: { gap: spacing3.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.md,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.md,
    borderRadius: radius3.lg,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    backgroundColor: colors3.surfaceContainer,
  },
  cardSelected: {
    borderColor: colors3.primary,
    backgroundColor: 'rgba(107, 56, 212, 0.08)',
    shadowColor: colors3.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: { backgroundColor: 'rgba(107, 56, 212, 0.18)' },
  label: { ...typography3.bodyMd, fontFamily: 'Inter_600SemiBold', flex: 1 },
  check: {
    width: 20,
    height: 20,
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: 'rgba(123, 116, 134, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: colors3.primary,
    borderColor: colors3.primary,
  },
});
