import React from 'react';
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, Text } from 'react-native';

import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

interface Button3Props extends Omit<PressableProps, 'style'> {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

/**
 * Equivalente de Button2.tsx pro sistema visual novo "prism-glass" (ver
 * colors3 em constants/theme.ts) — mesma API (label/loading/variant/
 * onPress/disabled...), so troca o tratamento visual: sem o glow roxo neon
 * do Button2 (o design novo nao usa glow em botao nenhum, so sombra suave
 * — ver `.liquid-progress`/shadow-glass do HTML de origem, nenhum dos dois
 * e um botao). Primary = preenchido roxo solido; secondary = contorno
 * roxo/30% (mesmo `border-primary/30` usado nos CTAs do carrossel e no
 * botao "Veja mais do seu progresso").
 */
export function Button3({ label, loading, variant = 'primary', disabled, ...rest }: Button3Props) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors3.onPrimary : colors3.primary} />
      ) : (
        <Text style={[typography3.labelMd, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius3.xl,
    paddingVertical: spacing3.md - 2,
    // Faltava paddingHorizontal -- invisivel em containers com
    // alignItems:'stretch' (padrao do RN, maioria dos usos), onde o botao
    // ja estica pra largura cheia do pai independente do padding interno.
    // Vira um bug real em containers com alignItems:'center' (ex:
    // AiWorkoutSection.tsx, estado vazio) -- ai o Pressable encolhe pro
    // tamanho do texto, e sem padding o texto fica colado na borda
    // arredondada. Button2.tsx tem o mesmo gap, ainda nao corrigido la.
    paddingHorizontal: spacing3.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: {
    backgroundColor: colors3.primary,
  },
  primaryLabel: {
    color: colors3.onPrimary,
  },
  secondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.3)',
  },
  secondaryLabel: {
    color: colors3.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
