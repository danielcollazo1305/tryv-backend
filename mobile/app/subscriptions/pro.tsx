import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Badge } from '@/components/Badge';
import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { useAuth } from '@/context/AuthContext';
import {
  PurchaseError,
  isPurchasesAvailable,
  loadProOffer,
  purchasePro,
  restorePurchases,
  syncProAfterPurchase,
  type ProOffer,
} from '@/services/purchases';
import { UserBadges, getUserBadges } from '@/services/user';
import { MANAGE_SUBSCRIPTIONS_URL, PRIVACY_URL, TERMS_URL } from '@/constants/legal';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// Mesmos 7 recursos do mockup assinatura-planos.html — todos com gating real
// de Pro ja implementado no backend hoje (confirmado direto no codigo via
// require_pro_subscription em dashboard.py, workout_plans.py, meals.py,
// heart_rate.py, runs.py, insights.py, readiness.py -- revalidado nesta
// investigacao, nao so por memoria da sessao). Frequencia de treino e km
// semanal (dashboard.py) e o resumo de Saude (smartwatch.py) NAO entram
// aqui de proposito -- viraram gratis nesta sessao, ver linha "free: true"
// abaixo na tabela de comparacao.
const BENEFITS: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string }[] = [
  { icon: 'sparkles', title: 'Inteligencia Artificial', subtitle: 'Analise de refeicao por foto e geracao de treino' },
  { icon: 'bulb', title: 'Insights proativos', subtitle: 'Recomendacoes personalizadas com base no seu progresso' },
  { icon: 'speedometer', title: 'Score de Prontidao', subtitle: 'Saiba quando treinar forte e quando recuperar' },
  { icon: 'bar-chart', title: 'Comparacao mes a mes', subtitle: 'Veja sua evolucao ao longo do tempo' },
  { icon: 'ribbon', title: 'Recordes pessoais (PRs)', subtitle: 'Identificacao automatica dos seus melhores resultados' },
  { icon: 'heart', title: 'Relatorio de frequencia cardiaca', subtitle: 'Analise detalhada da sua FC ao longo dos treinos' },
  { icon: 'document-text', title: 'Exportacao de relatorios em PDF', subtitle: 'Compartilhe seu progresso com quem quiser' },
];

// Inclui os 7 recursos Pro acima (PRs e Relatorio de FC estavam ausentes
// daqui antes -- a tabela ficou desatualizada em relacao a lista de
// beneficios ao longo da sessao) + os recursos que ja sao gratis hoje, pra
// deixar claro que nao foram tirados nem exigem Pro.
const COMPARISON_ROWS: { label: string; free: boolean }[] = [
  { label: 'Registro de treinos e refeicoes', free: true },
  { label: 'Frequencia de treino e km semanal', free: true },
  { label: 'Resumo de saude (passos, sono, FC)', free: true },
  { label: 'Analise de refeicao por foto (IA)', free: false },
  { label: 'Geracao de treino por IA', free: false },
  { label: 'Insights proativos', free: false },
  { label: 'Score de Prontidao', free: false },
  { label: 'Comparacao mes a mes', free: false },
  { label: 'Recordes pessoais (PRs)', free: false },
  { label: 'Relatorio de frequencia cardiaca', free: false },
  { label: 'Exportacao de relatorios em PDF', free: false },
];

type OfferState = 'loading' | 'ready' | 'unavailable' | 'error';
type Busy = 'purchase' | 'restore' | null;

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => {});
}

export default function TryvProScreen() {
  const { user, refreshIsPro } = useAuth();
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [offer, setOffer] = useState<ProOffer | null>(null);
  const [offerState, setOfferState] = useState<OfferState>('loading');
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOffer = useCallback(async () => {
    if (!isPurchasesAvailable()) {
      setOfferState('unavailable');
      return;
    }
    setOfferState('loading');
    try {
      const loaded = await loadProOffer();
      if (!mountedRef.current) return;
      setOffer(loaded);
      setOfferState(loaded ? 'ready' : 'unavailable');
    } catch {
      if (mountedRef.current) setOfferState('error');
    }
  }, []);

  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);

  // Depois da compra ou do restaurar: o servidor (webhook do RevenueCat) e quem confirma o Pro, nunca o app.
  const confirmWithServer = async (restoring: boolean) => {
    try {
      const result = await syncProAfterPurchase(refreshIsPro);
      if (!mountedRef.current) return;
      if (result.isPro) {
        router.replace('/subscriptions/confirmation');
      } else if (restoring && !result.pending) {
        setMessage({ kind: 'info', text: 'Não encontramos uma assinatura ativa para restaurar nesta conta Apple.' });
      } else {
        setMessage({
          kind: 'info',
          text: 'Recebemos sua compra e estamos confirmando. Seu acesso Pro será liberado em instantes. Se demorar, toque em "Restaurar compras".',
        });
      }
    } catch {
      if (mountedRef.current) {
        setMessage({
          kind: 'error',
          text: 'Não conseguimos confirmar com o servidor agora. Se você já pagou, toque em "Restaurar compras" em instantes.',
        });
      }
    }
  };

  const handleSubscribe = async () => {
    if (!user || !offer || busyRef.current) return;
    busyRef.current = true;
    setBusy('purchase');
    setMessage(null);
    try {
      const outcome = await purchasePro(user.id, offer.pkg);
      if (!mountedRef.current) return;
      if (outcome === 'purchased') await confirmWithServer(false);
      else if (outcome === 'pending') {
        setMessage({ kind: 'info', text: 'Sua compra está aguardando aprovação. O Pro será liberado assim que for aprovada.' });
      }
      // 'cancelled': o usuario fechou a folha da Apple; nao e erro, nada a mostrar.
    } catch (error) {
      if (mountedRef.current) {
        setMessage({
          kind: 'error',
          text: error instanceof PurchaseError ? error.message : 'Não foi possível concluir a compra. Tente novamente.',
        });
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (!user || busyRef.current) return;
    busyRef.current = true;
    setBusy('restore');
    setMessage(null);
    try {
      await restorePurchases(user.id);
      if (mountedRef.current) await confirmWithServer(true);
    } catch (error) {
      if (mountedRef.current) {
        setMessage({
          kind: 'error',
          text: error instanceof PurchaseError ? error.message : 'Não foi possível restaurar suas compras. Tente novamente.',
        });
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      getUserBadges(user.id)
        .then((data) => {
          if (active) setBadges(data);
        })
        .catch(() => {
          if (active) setBadges(null);
        });
      return () => {
        active = false;
      };
    }, [user])
  );

  const isPro = badges?.is_pro ?? false;

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv Fit</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="diamond" size={32} color={colors3.primary} />
          </View>
          <Text style={styles.heroTitle}>Tryv Fit Pro</Text>
          <Text style={styles.heroSubtitle}>
            Desbloqueie IA, insights e relatorios avancados para acelerar sua evolucao.
          </Text>
        </View>

        <GlassCard variant="glass" style={styles.benefitsCard}>
          {BENEFITS.map((benefit, index) => (
            <View key={benefit.title} style={[styles.benefitRow, index > 0 && styles.benefitRowDivider]}>
              <View style={styles.benefitIconWrap}>
                <Ionicons name={benefit.icon} size={20} color={colors3.primary} />
              </View>
              <View style={styles.benefitTexts}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitSubtitle}>{benefit.subtitle}</Text>
              </View>
            </View>
          ))}
        </GlassCard>

        {/* Preco e periodo vem SEMPRE do produto da loja (nunca digitados aqui). */}
        <GlassCard variant="glass" style={styles.priceCard}>
          <Text style={styles.priceLabel}>Tryv Fit Pro · assinatura{offer?.periodLabel ? ` por ${offer.periodLabel}` : ''}</Text>
          {offerState === 'loading' ? (
            <ActivityIndicator color={colors3.primary} style={styles.priceLoading} />
          ) : offerState === 'ready' && offer ? (
            <>
              <Text style={styles.price}>{offer.priceString}</Text>
              <Text style={styles.priceHint}>{offer.periodLabel ? `por ${offer.periodLabel} · ` : ''}renovação automática</Text>
            </>
          ) : offerState === 'error' ? (
            <>
              <Text style={styles.priceHint}>Não foi possível carregar o preço agora.</Text>
              <Pressable onPress={() => void loadOffer()} accessibilityRole="button">
                <Text style={styles.link}>Tentar de novo</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.priceHint}>Assinatura indisponível neste momento. Tente novamente mais tarde.</Text>
          )}
        </GlassCard>

        {!!message && (
          <Text style={message.kind === 'error' ? styles.messageError : styles.messageInfo} accessibilityLiveRegion="polite">
            {message.text}
          </Text>
        )}

        {isPro ? (
          <View style={styles.currentPlanRow}>
            <Badge label="Seu plano atual" variant="primary" />
          </View>
        ) : (
          <Button3
            label="Assinar Tryv Fit Pro"
            onPress={() => void handleSubscribe()}
            loading={busy === 'purchase'}
            disabled={offerState !== 'ready' || busy !== null}
          />
        )}

        <Button3
          label="Restaurar compras"
          variant="secondary"
          onPress={() => void handleRestore()}
          loading={busy === 'restore'}
          disabled={busy !== null}
        />

        <View style={styles.legalBox}>
          <Text style={styles.legalText}>
            Assinatura mensal com renovação automática. O pagamento é cobrado na sua conta Apple na confirmação da compra. A
            assinatura renova sozinha, a menos que seja cancelada pelo menos 24 horas antes do fim do período atual. Você pode
            gerenciar ou cancelar a qualquer momento em Ajustes &gt; Apple ID &gt; Assinaturas.
          </Text>
          <View style={styles.legalLinks}>
            <Pressable onPress={() => openUrl(MANAGE_SUBSCRIPTIONS_URL)} accessibilityRole="link">
              <Text style={styles.link}>Gerenciar assinatura</Text>
            </Pressable>
            <Pressable onPress={() => openUrl(TERMS_URL)} accessibilityRole="link">
              <Text style={styles.link}>Termos de Uso</Text>
            </Pressable>
            <Pressable onPress={() => openUrl(PRIVACY_URL)} accessibilityRole="link">
              <Text style={styles.link}>Política de Privacidade</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.comparisonSection}>
          <Text style={styles.comparisonTitle}>Gratis vs. Pro</Text>
          <GlassCard variant="glass" style={styles.comparisonCard} padding={0}>
            <View style={[styles.comparisonRow, styles.comparisonHeaderRow]}>
              <Text style={styles.comparisonHeaderLabel}>Recurso</Text>
              <Text style={styles.comparisonHeaderCell}>Gratis</Text>
              <Text style={[styles.comparisonHeaderCell, styles.comparisonHeaderCellPro]}>Pro</Text>
            </View>
            {COMPARISON_ROWS.map((row, index) => (
              <View
                key={row.label}
                style={[styles.comparisonRow, index < COMPARISON_ROWS.length - 1 && styles.comparisonRowDivider]}
              >
                <Text style={styles.comparisonLabel}>{row.label}</Text>
                <View style={styles.comparisonCell}>
                  <Ionicons
                    name={row.free ? 'checkmark' : 'close'}
                    size={16}
                    color={row.free ? colors3.onSurfaceVariant : colors3.outlineVariant}
                  />
                </View>
                <View style={styles.comparisonCell}>
                  <Ionicons name="checkmark" size={16} color={colors3.primary} />
                </View>
              </View>
            ))}
          </GlassCard>
        </View>
      </ScrollView>
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
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.lg, paddingBottom: spacing3.xl },

  hero: { alignItems: 'center', gap: spacing3.xs, marginTop: spacing3.sm },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(132, 85, 239, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing3.xs,
  },
  heroTitle: { ...typography3.headlineLg, fontSize: 28 },
  heroSubtitle: { ...typography3.bodyLg, fontSize: 16, color: colors3.onSurfaceVariant, textAlign: 'center' },

  benefitsCard: { gap: 0 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.md, paddingVertical: spacing3.sm },
  benefitRowDivider: { borderTopWidth: 1, borderTopColor: colors3.outlineVariant },
  benefitIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius3.pill,
    backgroundColor: 'rgba(107, 56, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTexts: { flex: 1, gap: 2 },
  benefitTitle: { ...typography3.bodyMd, fontWeight: '600' },
  benefitSubtitle: { ...typography3.labelSm, textTransform: 'none' },

  priceCard: { alignItems: 'center', gap: spacing3.xs },
  priceLabel: { ...typography3.labelSm, textTransform: 'uppercase' },
  price: { ...typography3.displayLg, fontSize: 40 },
  priceHint: { ...typography3.labelSm, textTransform: 'none', textAlign: 'center' },
  priceLoading: { marginVertical: spacing3.md },
  messageError: { ...typography3.bodyMd, fontSize: 13, color: colors3.error, textAlign: 'center' },
  messageInfo: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant, textAlign: 'center' },
  legalBox: { gap: spacing3.sm },
  legalText: { ...typography3.labelSm, textTransform: 'none', color: colors3.onSurfaceVariant, textAlign: 'center' },
  legalLinks: { alignItems: 'center', gap: spacing3.xs },
  link: { ...typography3.bodyMd, fontSize: 13, color: colors3.primary, textDecorationLine: 'underline' },

  currentPlanRow: { alignItems: 'center' },

  comparisonSection: { gap: spacing3.md },
  comparisonTitle: { ...typography3.headlineMd, fontSize: 18 },
  comparisonCard: { overflow: 'hidden' },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    padding: spacing3.md,
  },
  comparisonRowDivider: { borderBottomWidth: 1, borderBottomColor: colors3.outlineVariant },
  comparisonHeaderRow: { borderBottomWidth: 1, borderBottomColor: colors3.outlineVariant },
  comparisonHeaderLabel: { ...typography3.labelSm, textTransform: 'uppercase', flex: 1 },
  comparisonHeaderCell: { ...typography3.labelSm, textTransform: 'uppercase', width: 56, textAlign: 'center' },
  comparisonHeaderCellPro: { color: colors3.primary },
  comparisonLabel: { ...typography3.bodyMd, fontSize: 13, flex: 1 },
  comparisonCell: { width: 56, alignItems: 'center' },
});
