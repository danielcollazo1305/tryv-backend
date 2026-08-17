import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

export function InsightCard({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="bulb-outline" size={18} color={colors2.primary} />
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing2.sm,
    backgroundColor: colors2.surfaceContainer,
    borderRadius: radius2.md,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderLeftWidth: 3,
    borderLeftColor: colors2.violet,
    padding: spacing2.md,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, flex: 1 },
});
