import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { getApiErrorMessage } from '@/services/api';
import { checkoutTryvPro } from '@/services/subscriptions';
import { colors, radius, spacing, typography } from '@/constants/theme';

const BENEFITS = [
  'Resumo diario e insights gerados por IA',
  'Score de prontidao (readiness) baseado em sono, carga e frequencia cardiaca',
  'Analise automatica de fotos de refeicao',
  'Geracao de planos de treino por IA',
];

export default function TryvProScreen() {
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setSubscribing(true);
    setError(null);
    setInfo(null);
    try {
      const { checkout_url } = await checkoutTryvPro();
      await WebBrowser.openBrowserAsync(checkout_url);
      // Nao ha endpoint de "minhas assinaturas" ainda para confirmar de fato —
      // so informamos que o pagamento deve ter sido processado.
      setInfo('Se voce concluiu o pagamento, sua assinatura Tryv Pro ja deve estar ativa.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel iniciar a assinatura, tente novamente.'));
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Tryv Pro</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.priceCard}>
          <Text style={styles.priceLabel}>Assinatura mensal</Text>
          <Text style={styles.price}>R$ 49,00</Text>
        </Card>

        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!!info && (
          <Card style={styles.infoCard}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.infoText}>{info}</Text>
          </Card>
        )}

        <Button label="Assinar Tryv Pro" onPress={handleSubscribe} loading={subscribing} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  error: { color: colors.danger, textAlign: 'center' },

  priceCard: { alignItems: 'center', gap: spacing.xs },
  priceLabel: { ...typography.caption },
  price: { ...typography.statNumber, fontSize: 28 },

  benefits: { gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitText: { ...typography.body, flex: 1 },

  infoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { ...typography.bodySecondary, flex: 1 },
});
