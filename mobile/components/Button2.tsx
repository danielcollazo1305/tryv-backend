import React from 'react';
import { ActivityIndicator, Platform, Pressable, PressableProps, StyleSheet, Text } from 'react-native';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface Button2Props extends Omit<PressableProps, 'style'> {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

/**
 * Equivalente do Button.tsx pro design novo (liquiglass) — mesma API
 * (label/loading/variant/onPress/disabled...) pra facilitar trocar um pelo
 * outro conforme cada tela for migrada. Ver constants/theme.ts pro porque
 * de dois sistemas convivendo.
 *
 * Visual: botao "pill" com glow roxo, igual ao CTA principal usado em
 * quase todos os designs HTML (.neon-glow / .neon-glow-btn com fundo
 * #8B5CF6). O glow via shadow* so aparece de verdade no iOS — Android
 * ignora shadowColor fora de preto/cinza (limitacao conhecida da
 * plataforma), entao la o botao fica so com a sombra padrao do elevation,
 * sem o tom roxo. Nao ha alternativa nativa sem uma lib extra so pra isso.
 */
export function Button2({ label, loading, variant = 'primary', disabled, ...rest }: Button2Props) {
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
        <ActivityIndicator color={isPrimary ? colors2.white : colors2.primary} />
      ) : (
        <Text style={[typography2.button, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius2.pill,
    paddingVertical: spacing2.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: {
    backgroundColor: colors2.violet,
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Platform.OS === 'ios' ? 0.5 : 0,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryLabel: {
    color: colors2.white,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors2.violet,
  },
  secondaryLabel: {
    color: colors2.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
