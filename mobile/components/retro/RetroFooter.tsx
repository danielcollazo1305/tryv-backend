import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RetroBar } from '@/components/retro/RetroBar';
import { RETRO } from '@/components/retro/retroTheme';

interface RetroFooterProps {
  onBack: () => void;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  actionAccessibilityLabel?: string;
}

/** Barra inferior fixa: VOLTAR / acao principal (ENTRAR ou INICIAR), respeitando a safe area. */
export function RetroFooter({ onBack, actionLabel, onAction, actionDisabled, actionAccessibilityLabel }: RetroFooterProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <RetroBar label="Voltar" onPress={onBack} style={styles.cell} />
      <RetroBar
        label={actionLabel}
        highlighted
        onPress={onAction}
        disabled={actionDisabled}
        accessibilityLabel={actionAccessibilityLabel}
        style={styles.cell}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: RETRO.border,
    backgroundColor: RETRO.bg,
  },
  cell: { flex: 1 },
});
