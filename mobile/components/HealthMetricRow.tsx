import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors2, colors3, radius2, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';

interface HealthMetricRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  value: string;
  subLabel?: string;
  /** Se ausente, a linha e apenas informativa (sem chevron, sem toque). */
  children?: React.ReactNode;
  /** 'dark' (padrao) = colors2, unico consumidor hoje (HealthSummaryCard.tsx). 'light' = colors3, propagado quando HealthSummaryCard recebe variant="light". */
  variant?: 'dark' | 'light';
}

/**
 * Linha tocavel de uma metrica de saude — resumo sempre visivel (icone
 * colorido, label, valor), e se `children` for passado, expande ao toque
 * pra mostrar mais contexto (ex: grafico da semana). Cada linha guarda seu
 * proprio estado de expansao, independente das outras.
 */
export function HealthMetricRow({ icon, color, label, value, subLabel, children, variant = 'dark' }: HealthMetricRowProps) {
  const isLight = variant === 'light';
  const s = isLight ? stylesLight : styles;
  const [expanded, setExpanded] = useState(false);
  const expandable = !!children;

  const content = (
    <View style={s.row}>
      <View style={[s.iconWrap, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={s.info}>
        <Text style={s.label}>{label}</Text>
        {!!subLabel && <Text style={s.subLabel}>{subLabel}</Text>}
      </View>
      <Text style={[s.value, { color }]}>{value}</Text>
      {expandable && (
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={isLight ? colors3.onSurfaceVariant : colors2.onSurfaceVariant}
          style={s.chevron}
        />
      )}
    </View>
  );

  return (
    <View style={s.container}>
      {expandable ? <Pressable onPress={() => setExpanded((prev) => !prev)}>{content}</Pressable> : content}
      {expandable && expanded && <View style={s.expandedContent}>{children}</View>}
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

const stylesLight = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors3.outlineVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    paddingVertical: spacing3.sm + 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius3.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  label: { ...typography3.bodyMd, fontSize: 15 },
  subLabel: { ...typography3.labelSm, textTransform: 'none', marginTop: 2 },
  value: { ...typography3.bodyMd, fontSize: 15, fontWeight: '700' },
  chevron: { marginLeft: spacing3.xs },
  expandedContent: { paddingBottom: spacing3.md },
});
