import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getApiErrorMessage } from '@/services/api';
import { checkoutTryvPro } from '@/services/subscriptions';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

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
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors3.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv Fit</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>Confirme sua assinatura</Text>
          <Text style={styles.subtitle}>Revise os detalhes antes de continuar para o pagamento.</Text>
        </View>

        <GlassCard variant="glass" style={styles.summaryCard}>
          <View style={styles.summaryLeft}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="diamond" size={20} color={colors3.primary} />
            </View>
            <Text style={styles.summaryTitle}>Tryv Fit Pro</Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryPrice}>R$ 39,90</Text>
            <Text style={styles.summaryPriceUnit}>/mes</Text>
          </View>
        </GlassCard>

        {/*
          Nao ha SDK de pagamento (Stripe/Apple Pay) embutido nesta tela —
          o fluxo real abre o checkout hospedado do Stripe num browser
          EXTERNO (WebBrowser.openBrowserAsync abaixo), fora da arvore RN.
          Esse card e so o aviso de seguranca, nao uma UI de pagamento —
          por isso nao ha nada aqui pra "recriar" de um SDK terceiro.
        */}
        <GlassCard variant="glass" style={styles.noticeCard}>
          <Ionicons name="lock-closed" size={20} color={colors3.primary} />
          <View style={styles.noticeTexts}>
            <Text style={styles.noticeTitle}>Pagamento processado com seguranca via Stripe</Text>
            <Text style={styles.noticeSubtitle}>
              Seus dados de cartao nunca passam pelos servidores do Tryv Fit — voce sera redirecionado para o checkout
              seguro do Stripe.
            </Text>
          </View>
        </GlassCard>

        <View style={styles.spacer} />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button3
          label="Continuar para pagamento"
          onPress={handleContinue}
          loading={subscribing}
        />
        <Text style={styles.cancelHint}>Cancele quando quiser, sem multa.</Text>

        {browserOpened && (
          <GlassCard variant="glass" style={styles.returnCard}>
            <Text style={styles.returnText}>Ja concluiu o pagamento no navegador?</Text>
            <Button3
              label="Ja paguei — ver confirmacao"
              variant="secondary"
              onPress={() => router.push('/subscriptions/confirmation')}
            />
          </GlassCard>
        )}
      </View>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  content: { flex: 1, padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.lg },

  intro: { gap: spacing3.xs },
  title: { ...typography3.headlineLg, fontSize: 24 },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },

  summaryCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: { ...typography3.bodyLg, fontSize: 16, fontWeight: '600' },
  summaryRight: { alignItems: 'flex-end' },
  summaryPrice: { ...typography3.bodyMd, fontSize: 18, fontWeight: '700' },
  summaryPriceUnit: { ...typography3.labelSm, textTransform: 'uppercase' },

  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing3.sm },
  noticeTexts: { flex: 1, gap: spacing3.xs },
  noticeTitle: { ...typography3.bodyMd, fontWeight: '600' },
  noticeSubtitle: { ...typography3.labelSm, textTransform: 'none' },

  spacer: { flex: 1, minHeight: spacing3.lg },
  error: { color: colors3.error, textAlign: 'center' },
  cancelHint: { ...typography3.labelSm, textTransform: 'none', textAlign: 'center' },

  returnCard: { alignItems: 'center', gap: spacing3.sm, marginTop: spacing3.md },
  returnText: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurfaceVariant, textAlign: 'center' },
});
