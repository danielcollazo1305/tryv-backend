import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

/** Carregando a 1a pagina de uma aba. */
export function FeedLoading() {
  return (
    <View style={styles.box} accessibilityLabel="Carregando" accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors3.primary} />
    </View>
  );
}

/** Erro da 1a pagina: mensagem fixa em portugues e "Tentar de novo" (as outras abas nao sao afetadas). */
export function FeedError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.box}>
      <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
        {message}
      </Text>
      <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button" accessibilityLabel="Tentar de novo">
        <Text style={styles.retryText}>Tentar de novo</Text>
      </Pressable>
    </View>
  );
}

/** Aba sem nada ainda. */
export function FeedEmpty({ icon, title, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }) {
  return (
    <View style={styles.box}>
      <Ionicons name={icon} size={32} color={colors3.onSurfaceVariant} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/** Rodape das listas: roda enquanto carrega a proxima pagina. */
export function FeedFooterLoading({ visible }: { visible: boolean }) {
  return visible ? <ActivityIndicator color={colors3.primary} style={styles.footer} /> : null;
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing3.xl, paddingHorizontal: spacing3.md, gap: spacing3.sm },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },
  retry: {
    minHeight: 44,
    paddingHorizontal: spacing3.lg,
    borderRadius: radius3.pill,
    borderWidth: 1,
    borderColor: colors3.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { ...typography3.labelMd, color: colors3.primary, textTransform: 'none' },
  emptyTitle: { ...typography3.headlineMd, fontSize: 16, textAlign: 'center' },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  footer: { marginVertical: spacing3.md },
});
