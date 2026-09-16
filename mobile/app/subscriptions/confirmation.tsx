import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

const FEATURE_CHIPS: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { icon: 'sparkles', label: 'IA' },
  { icon: 'bulb', label: 'Insights' },
  { icon: 'speedometer', label: 'Prontidao' },
  { icon: 'bar-chart', label: 'Comparacoes' },
  { icon: 'ribbon', label: 'PRs' },
  { icon: 'heart', label: 'Relatorio de FC' },
  { icon: 'document-text', label: 'Exportacao PDF' },
];

/**
 * Sem deep link de retorno do Stripe configurado hoje (ver checkout.tsx) —
 * esta tela nao confirma pagamento de verdade, so mostra o mesmo visual de
 * sucesso que a suposicao ja fazia antes (assume que, se o usuario chegou
 * aqui, o pagamento foi concluido no navegador).
 */
export default function SubscriptionConfirmationScreen() {
  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <Text style={styles.headerTitle}>Tryv Fit</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={56} color={colors2.primary} />
        </View>

        <View style={styles.texts}>
          <Text style={styles.title}>Parabens! Voce agora e Tryv Fit Pro</Text>
          <Text style={styles.subtitle}>Todos os recursos avancados ja estao liberados na sua conta.</Text>
        </View>

        <LiquiglassCard style={styles.chipsCard}>
          <View style={styles.chipsRow}>
            {FEATURE_CHIPS.map((chip) => (
              <View key={chip.label} style={styles.chip}>
                <Ionicons name={chip.icon} size={14} color={colors2.primary} />
                <Text style={styles.chipText}>{chip.label}</Text>
              </View>
            ))}
          </View>
        </LiquiglassCard>

        <Button2 label="Explorar recursos Pro" onPress={() => router.replace('/(tabs)')} />
      </View>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { flex: 1, padding: spacing2.containerMargin, alignItems: 'center', gap: spacing2.lg },

  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: radius2.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing2.xl,
  },
  texts: { alignItems: 'center', gap: spacing2.xs },
  title: { ...typography2.headlineLgMobile, fontSize: 24, textAlign: 'center' },
  subtitle: { ...typography2.bodyLg, fontSize: 16, color: colors2.onSurfaceVariant, textAlign: 'center' },

  chipsCard: { width: '100%' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.pill,
    paddingHorizontal: spacing2.sm + 2,
    paddingVertical: 6,
  },
  chipText: { ...typography2.labelCaps, fontSize: 10, textTransform: 'none' },
});
