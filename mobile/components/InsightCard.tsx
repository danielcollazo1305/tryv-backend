import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/**
 * Migrado pro tema claro "prism-glass" nesta tarefa (colors2 -> colors3) —
 * exclusivo da Home (confirmado, nenhum outro import real do componente),
 * migracao direta. So recoloracao, nenhuma logica de geracao de insight
 * alterada.
 */
export function InsightCard({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="bulb-outline" size={18} color={colors3.primary} />
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing3.sm,
    backgroundColor: colors3.surfaceContainer,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderLeftWidth: 3,
    borderLeftColor: colors3.primary,
    padding: spacing3.md,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, flex: 1 },
});
