import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

interface TextField2Props extends TextInputProps {
  label: string;
  error?: string;
  /**
   * 'dark' (padrao) = colors2/liquiglass, usado hoje em ~20 telas (cadastro,
   * desafios, geracao de treino...). 'light' = colors3/prism-glass, so pra
   * telas ja migradas (Login) — mesmo padrao de variant ja usado em
   * EmptyFollowingState/ObscuredCard, pra nao quebrar os consumidores ainda
   * escuros.
   */
  variant?: 'dark' | 'light';
}

/**
 * Equivalente do TextField.tsx pro design novo — mesma API (label/error +
 * todo TextInputProps). TextField original continua em uso em varios
 * fluxos fora desta migracao (login, cadastro, perfil, etc.) — por isso
 * versao nova em vez de editar a antiga.
 *
 * Adiciona glow roxo no foco (igual aos inputs ".input-premium"/
 * ".liquiglass-input" dos mockups), que o TextField antigo nao tinha —
 * so precisa de estado local pra saber quando o campo esta focado, RN nao
 * tem pseudo-classe :focus como CSS. No variant light o glow vira uma
 * sombra bem mais sutil (prism-glass nao usa glow neon em nenhum lugar,
 * ver comentario equivalente em Button3.tsx).
 */
export function TextField2({ label, error, style, onFocus, onBlur, variant = 'dark', ...rest }: TextField2Props) {
  const [focused, setFocused] = useState(false);
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;

  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={isLight ? colors3.onSurfaceVariant : colors2.onSurfaceVariant}
        style={[s.input, focused && s.inputFocused, !!error && s.inputError, style]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {!!error && <Text style={s.errorText}>{error}</Text>}
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
    marginBottom: spacing2.xs,
  },
  input: {
    backgroundColor: colors2.surfaceContainer,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm + 4,
    color: colors2.onSurface,
    fontSize: 16,
  },
  inputFocused: {
    borderColor: colors2.violet,
    shadowColor: colors2.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
  inputError: {
    borderColor: colors2.danger,
  },
  errorText: {
    ...typography2.labelCaps,
    textTransform: 'none',
    color: colors2.danger,
    marginTop: spacing2.xs,
  },
});

const stylesLight = StyleSheet.create({
  container: {
    marginBottom: spacing3.md,
  },
  label: {
    ...typography3.labelSm,
    textTransform: 'none',
    marginBottom: spacing3.xs,
  },
  input: {
    backgroundColor: colors3.surfaceContainer,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm + 4,
    color: colors3.onSurface,
    fontSize: 16,
  },
  inputFocused: {
    borderColor: colors3.primary,
    shadowColor: colors3.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  inputError: {
    borderColor: colors3.error,
  },
  errorText: {
    ...typography3.labelSm,
    textTransform: 'none',
    color: colors3.error,
    marginTop: spacing3.xs,
  },
});
