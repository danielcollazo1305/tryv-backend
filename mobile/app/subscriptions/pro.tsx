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

// Os 8 recursos Pro abaixo batem com o que o codigo realmente bloqueia hoje (backend: require_pro_subscription / has_active_pro_subscription;
// mobile: isPro): meals.py (/analyze e /analyze-text), workout_plans.py (/generate), insights.py (/daily e /generate), dashboard.py
// (/home-summary, /month-comparison, /period-comparison), card de prontidao da Home (index.tsx), runs.py (/personal-records e new_prs),
// heart_rate.py (/report) e a exportacao em PDF (que usa os endpoints Pro). NAO entram aqui: rastreamento por GPS, mapa e parciais por km,
// treino livre, Vitalidade (a prontidao da aba Treino), frequencia de treino e km semanal, resumo de saude, avatar e a interpretacao por IA
// de uma atividade ja registrada -- sao gratuitos (ver as linhas "free: true" da tabela de comparacao).
const BENEFITS: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string }[] = [
  { icon: 'camera', title: 'Análise de refeições por IA', subtitle: 'Por foto e por texto' },
  { icon: 'barbell', title: 'Plano de treino por IA', subtitle: 'Gerado para o seu objetivo, nível e equipamento' },
  { icon: 'bulb', title: 'Insight diário por IA', subtitle: 'Uma recomendação por dia com base no seu progresso' },
  { icon: 'bar-chart', title: 'Resumo e comparativos na tela inicial', subtitle: 'Resumo do período e comparação mês a mês e entre períodos' },
  { icon: 'speedometer', title: 'Prontidão na tela inicial', subtitle: 'Card de prontidão para treinar na tela inicial' },
  { icon: 'ribbon', title: 'Recordes pessoais', subtitle: 'Seus melhores resultados em corrida, pedalada e caminhada' },
  { icon: 'heart', title: 'Relatório de frequência cardíaca', subtitle: 'Análise da sua FC ao longo do período' },
  { icon: 'document-text', title: 'Exportação de relatórios em PDF', subtitle: 'Compartilhe seu progresso com quem quiser' },
];

// Gratis x Pro: as linhas Pro repetem os 8 recursos acima; as gratuitas sao o que continua livre (confirmado no codigo).
const COMPARISON_ROWS: { label: string; free: boolean }[] = [
  { label: 'Registro de treinos (treino livre) e de refeições', free: true },
  { label: 'Rastreamento por GPS, com mapa e parciais por km', free: true },
  { label: 'Frequência de treino e km semanal', free: true },
  { label: 'Vitalidade (prontidão na aba Treino)', free: true },
  { label: 'Resumo de saúde (passos, sono, FC)', free: true },
  { label: 'Análise de refeições por IA (foto e texto)', free: false },
  { label: 'Plano de treino por IA', free: false },
  { label: 'Insight diário por IA', free: false },
  { label: 'Resumo e comparativos na tela inicial', free: false },
  { label: 'Card de prontidão na tela inicial', free: false },
  { label: 'Recordes pessoais', free: false },
  { label: 'Relatório de frequência cardíaca', free: false },
  { label: 'Exportação de relatórios em PDF', free: false },
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
