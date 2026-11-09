import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { colors3, spacing3, typography3 } from '@/constants/theme';

// Itens Pro que aparecem na Home (resumo, comparativo, insight, prontidao e recordes); a lista completa do que o Pro libera
// fica em subscriptions/pro.tsx. Mantenha em sincronia com os blocos Pro de (tabs)/index.tsx.
const HOME_PRO_ITEMS = [
  'Resumo do período',
  'Comparativo mensal',
  'Insight diário por IA',
  'Card de prontidão para treinar',
  'Recordes pessoais',
];

/**
 * Convite ao Tryv Fit Pro na Home, no lugar dos blocos Pro que nao aparecem para o usuario gratuito.
 * Quem usa decide QUANDO mostrar: so com `isPro === false` (useAuth). `null` = ainda carregando, e nesse caso nao
 * deve aparecer (o usuario Pro nao pode ver o convite piscar).
 */
export function ProUpsellCard() {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color={colors3.primary} />
        <Text style={styles.title}>Tryv Fit Pro</Text>
      </View>
      <Text style={styles.subtitle}>Com o Pro, a tela inicial também mostra:</Text>
      <View style={styles.list}>
        {HOME_PRO_ITEMS.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="checkmark-circle" size={18} color={colors3.primary} />
            <Text style={styles.rowLabel}>{item}</Text>
          </View>
        ))}
      </View>
      <Button3 label="Conhecer o Tryv Fit Pro" onPress={() => router.push('/subscriptions/pro')} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing3.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  title: { ...typography3.headlineMd, fontSize: 18 },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  list: { gap: spacing3.xs, marginBottom: spacing3.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  rowLabel: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurface },
});
