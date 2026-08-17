import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { getApiErrorMessage } from '@/services/api';
import { checkoutTryvPro } from '@/services/subscriptions';
import { colors2, spacing2, typography2 } from '@/constants/theme';

export default function SubscriptionCheckoutScreen() {
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true depois que o navegador do Stripe foi aberto e fechado pelo menos
  // uma vez — nao confirma pagamento de verdade (sem deep link de retorno
  // configurado hoje), so libera o botao "Ja paguei" pra seguir pro visual
  // de confirmacao, igual a suposicao que a tela antiga ja fazia.
  const [browserOpened, setBrowserOpened] = useState(false);

  const handleContinue = async () => {
    setSubscribing(true);
    setError(null);
    try {
      const { checkout_url } = await checkoutTryvPro();
      await WebBrowser.openBrowserAsync(checkout_url);
      setBrowserOpened(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel iniciar a assinatura, tente novamente.'));
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors2.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>Confirme sua assinatura</Text>
          <Text style={styles.subtitle}>Revise os detalhes antes de continuar para o pagamento.</Text>
        </View>

        <LiquiglassCard style={styles.summaryCard}>
          <View style={styles.summaryLeft}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="diamond" size={20} color={colors2.primary} />
            </View>
            <Text style={styles.summaryTitle}>Tryv Pro</Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryPrice}>R$ 39,90</Text>
            <Text style={styles.summaryPriceUnit}>/mes</Text>
          </View>
        </LiquiglassCard>

        <LiquiglassCard style={styles.noticeCard}>
          <Ionicons name="lock-closed" size={20} color={colors2.primary} />
          <View style={styles.noticeTexts}>
            <Text style={styles.noticeTitle}>Pagamento processado com seguranca via Stripe</Text>
            <Text style={styles.noticeSubtitle}>
              Seus dados de cartao nunca passam pelos servidores do Tryv — voce sera redirecionado para o checkout
              seguro do Stripe.
            </Text>
          </View>
        </LiquiglassCard>

        <View style={styles.spacer} />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button2
          label="Continuar para pagamento"
          onPress={handleContinue}
          loading={subscribing}
        />
        <Text style={styles.cancelHint}>Cancele quando quiser, sem multa.</Text>

        {browserOpened && (
          <LiquiglassCard style={styles.returnCard}>
            <Text style={styles.returnText}>Ja concluiu o pagamento no navegador?</Text>
            <Button2
              label="Ja paguei — ver confirmacao"
              variant="secondary"
              onPress={() => router.push('/subscriptions/confirmation')}
            />
          </LiquiglassCard>
        )}
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
  content: { flex: 1, padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.lg },

  intro: { gap: spacing2.xs },
  title: { ...typography2.headlineLgMobile, fontSize: 24 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  summaryCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing2.sm },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: { ...typography2.bodyLg, fontSize: 16, fontWeight: '600' },
  summaryRight: { alignItems: 'flex-end' },
  summaryPrice: { ...typography2.metricMono, fontSize: 18 },
  summaryPriceUnit: { ...typography2.labelCaps },

  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing2.sm },
  noticeTexts: { flex: 1, gap: spacing2.xs },
  noticeTitle: { ...typography2.bodyMd, fontWeight: '600' },
  noticeSubtitle: { ...typography2.labelCaps, textTransform: 'none' },

  spacer: { flex: 1, minHeight: spacing2.lg },
  error: { color: colors2.danger, textAlign: 'center' },
  cancelHint: { ...typography2.labelCaps, textAlign: 'center' },

  returnCard: { alignItems: 'center', gap: spacing2.sm, marginTop: spacing2.md },
  returnText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurfaceVariant, textAlign: 'center' },
});
