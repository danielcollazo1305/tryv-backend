import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface TextField2Props extends TextInputProps {
  label: string;
  error?: string;
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
 * tem pseudo-classe :focus como CSS.
 */
export function TextField2({ label, error, style, onFocus, onBlur, ...rest }: TextField2Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors2.onSurfaceVariant}
        style={[styles.input, focused && styles.inputFocused, !!error && styles.inputError, style]}
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
      {!!error && <Text style={styles.errorText}>{error}</Text>}
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
