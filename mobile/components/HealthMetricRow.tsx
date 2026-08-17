import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface HealthMetricRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  value: string;
  subLabel?: string;
  /** Se ausente, a linha e apenas informativa (sem chevron, sem toque). */
  children?: React.ReactNode;
}

/**
 * Linha tocavel de uma metrica de saude — resumo sempre visivel (icone
 * colorido, label, valor), e se `children` for passado, expande ao toque
 * pra mostrar mais contexto (ex: grafico da semana). Cada linha guarda seu
 * proprio estado de expansao, independente das outras.
 */
export function HealthMetricRow({ icon, color, label, value, subLabel, children }: HealthMetricRowProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = !!children;

  const content = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        {!!subLabel && <Text style={styles.subLabel}>{subLabel}</Text>}
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      {expandable && (
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors2.onSurfaceVariant}
          style={styles.chevron}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {expandable ? <Pressable onPress={() => setExpanded((prev) => !prev)}>{content}</Pressable> : content}
      {expandable && expanded && <View style={styles.expandedContent}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.sm,
    paddingVertical: spacing2.sm + 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius2.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  label: { ...typography2.bodyMd, fontSize: 15 },
  subLabel: { ...typography2.labelCaps, textTransform: 'none', marginTop: 2 },
  value: { ...typography2.bodyMd, fontSize: 15, fontWeight: '700' },
  chevron: { marginLeft: spacing2.xs },
  expandedContent: { paddingBottom: spacing2.md },
});
