import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { AiWorkoutCard } from '@/components/AiWorkoutCard';
import { GlassCard } from '@/components/GlassCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { DesafiosCarouselSlide } from '@/components/DesafiosCarouselSlide';
import { ExportPdfCard } from '@/components/ExportPdfCard';
import { HealthMetricsGrid } from '@/components/HealthMetricsGrid';
import { InsightCard } from '@/components/InsightCard';
import { MonthComparisonCard } from '@/components/MonthComparisonCard';
import { PersonalRecordsCard } from '@/components/PersonalRecordsCard';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ReadinessCard } from '@/components/ReadinessCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TrainerPartnerRow } from '@/components/TrainerPartnerRow';
import { TrainersHighlight } from '@/components/TrainersHighlight';
import { TrainingFrequencyCard } from '@/components/TrainingFrequencyCard';
import { ActivityProgressCard } from '@/components/ActivityProgressCard';
import { TodayWorkoutCard } from '@/components/TodayWorkoutCard';
import { WeightChart } from '@/components/WeightChart';
import { getApiErrorMessage } from '@/services/api';
import { HomeSummary, getHomeSummary } from '@/services/dashboard';
import { DailyInsight, getDailyInsight } from '@/services/insights';
import { subscribeToDashboardChanges } from '@/utils/dashboardEvents';
import { colors2, colors3, radius3, spacing2, spacing3, typography2, typography3 } from '@/constants/theme';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from './_layout';

type ViewMode = { type: 'rolling' } | { type: 'month'; year: number; month: number };

/** "Qua, 19 de agosto" — mesmo formato do rotulo de data do mockup, abaixo da saudacao. */
function todayLabel(): string {
  const label = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '');
}

function monthLabel(year: number, month: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? '';
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>({ type: 'rolling' });

  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // O insight tem seu proprio ciclo de carregamento, independente do resto
  // do dashboard — pode demorar mais (gera via IA na primeira vez do dia) e
  // uma falha nele nao deve travar o resto da Home.
  const [insight, setInsight] = useState<DailyInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params =
        viewMode.type === 'month'
          ? { month: `${viewMode.year}-${String(viewMode.month).padStart(2, '0')}` }
          : { period: '30d' };
      setSummary(await getHomeSummary(params));
    } catch (err) {
      // 402 aqui = require_pro_subscription (o resumo da Home e conteudo
      // Pro) — confirmado no codigo (backend/app/core/deps.py:75, HTTP 402
      // Payment Required, nao 403). Isso dispara sozinho toda vez que a
      // Home monta, pra QUALQUER usuario sem assinatura — nao e uma falha
      // real nem uma acao que o usuario tentou e foi barrado, entao nao
      // deve virar um banner vermelho de erro. Mesmo padrao ja usado por
      // MonthComparisonCard/ReadinessCard/PersonalRecordsCard/InsightCard:
      // some da tela em vez de mostrar a mensagem crua do backend.
      const isProRequired = axios.isAxiosError(err) && err.response?.status === 402;
      setSummary(null);
      if (!isProRequired) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu resumo.'));
      }
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  const goToPreviousMonth = () => {
    if (viewMode.type === 'rolling') {
      const now = new Date();
      setViewMode({ type: 'month', year: now.getFullYear(), month: now.getMonth() + 1 });
      return;
    }
    let { year, month } = viewMode;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    setViewMode({ type: 'month', year, month });
  };

  const goToNextMonth = () => {
    if (viewMode.type === 'rolling') return;
    const now = new Date();
    let { year, month } = viewMode;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    // Passou do mes atual — volta pra visao "ultimos 30 dias" (nao ha "futuro" pra ver).
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
      setViewMode({ type: 'rolling' });
    } else {
      setViewMode({ type: 'month', year, month });
    }
  };

  const fetchInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      setInsight(await getDailyInsight());
    } catch {
      setInsight(null);
    } finally {
      setInsightLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
    }, [fetchSummary])
  );

  useFocusEffect(
    useCallback(() => {
      fetchInsight();
    }, [fetchInsight])
  );

  // Sinal explicito, alem do foco de navegacao: voltar de uma tela modal (ex:
  // /weight/new) nem sempre dispara o evento de foco do tab de forma
  // confiavel em todo dispositivo — isso garante o recarregamento mesmo assim.
  useEffect(() => subscribeToDashboardChanges(fetchSummary), [fetchSummary]);

  const weightChangeLabel =
    summary?.weight_change_kg != null
      ? `${summary.weight_change_kg > 0 ? '+' : ''}${summary.weight_change_kg.toFixed(1)}kg`
      : '--';
  const deficit = summary?.calorie_summary?.avg_deficit;
  const deficitLabel = deficit != null ? `${Math.round(deficit)}` : '--';

  return (
    <ScreenBackground3>
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: insets.top + spacing3.md,
          // Tab bar flutuante nao empurra mais o layout (era barra fixa
          // antes, o React Navigation reservava esse espaco sozinho) —
          // sem isso, o ultimo item do scroll (TrainerPartnerRow) fica
          // parcialmente escondido atras dela. altura da barra +
          // espaco ate a safe area + respiro extra pedido (spacing3.lg).
          paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + spacing3.lg,
        },
      ]}
    >
      {/*
        O HTML de referencia tem uma TopAppBar fixa/sticky separada
        (hamburger + "TRYV" central + avatar, sempre visivel por cima do
        scroll) e a saudacao como uma secao a parte, mais abaixo, dentro do
        scroll. Nao implementei a barra fixa de verdade (position fixed) —
        exigiria reestruturar a tela em 2 camadas (header fora do
        ScrollView) e um botao de menu hamburguer sem nenhum menu/drawer
        real por tras dele (o app nao tem esse recurso) — mantive o "Tryv"
        + avatar como a primeira linha do proprio scroll, igual a versao
        anterior, so retemado. A saudacao abaixo segue exatamente a secao
        "Header & Greeting" do HTML (so "Olá, Nome" + data, sem logo/avatar
        junto).
      */}
      <View style={styles.headerBlock}>
        <View style={styles.brandRow}>
          <Text style={styles.logo}>Tryv</Text>
          <View style={styles.headerActions}>
            <ProfileAvatarButton size={32} />
            <Pressable onPress={logout} style={styles.logoutButton} hitSlop={12}>
              <Ionicons name="log-out-outline" size={20} color={colors3.onSurfaceVariant} />
            </Pressable>
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.greeting}>Olá, {firstName}</Text>
          <Text style={styles.dateLabel}>{todayLabel()}</Text>
        </View>
      </View>

      {/*
        1. Hero "Começar treino" — religado (estava removido nesta mesma
        migracao pro tema claro, ver historico) — so aparece com plano IA
        ativo + dia real mapeado (day_of_week), ver TodayWorkoutCard.tsx.
        Sem isso, a Home comeca direto no grid de saude, como antes.
      */}
      <TodayWorkoutCard />

      {/* 2. Card de Saude. */}
      <HealthMetricsGrid />

      {/*
        3. Progresso (Corrida/Musculacao, estilo Strava) — substitui o
        antigo card "Km rodados" (WeeklyActivityChart continua existindo,
        agora so usado no perfil publico de outra pessoa em
        social/[userId].tsx). Sem Pressable por fora feito o card antigo
        tinha: o card tem suas proprias abas/toggle tocaveis por dentro, e
        o botao "Veja mais do seu progresso" ja cobre a navegacao pra
        /activity que o chevron fazia.
      */}
      <ActivityProgressCard />

      {/* 4. Frequencia de treino — heatmap estilo GitHub. */}
      <TrainingFrequencyCard />

      {/*
        5-8. Carrossel unificado "Para voce" — Treino com IA, Relatorio em
        PDF e Desafios (cada slide e um componente auto-suficiente, mesmo
        padrao ja usado por AiWorkoutCard/DesafiosCarouselSlide). O Desafios
        "sabe" mostrar sozinho o progresso real quando ha desafio(s)
        oficial(is) ativo(s), ou o convite generico quando nao ha nenhum —
        ver DesafiosCarouselSlide.tsx.

        O card de "Exportar PDF" (antes fixo aqui, com os 2 seletores de
        data direto na Home) virou o slide ExportPdfCard.tsx: abre
        app/export-pdf.tsx (modal com a mesma logica/validacao de antes,
        so realocada) em vez de ficar sempre visivel ocupando espaco fixo.
        Reaproveita a imagem "acompanhamento-profissional-card.png", que
        ficou sem uso quando TrainersHighlight foi escondida do
        marketplace pre-lancamento (ver comentario dela abaixo).
      */}
      <Text style={styles.forYouTitle}>Para você</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.forYouRow}
        style={styles.forYouScroll}
      >
        <AiWorkoutCard />
        <ExportPdfCard />
        {/* Marketplace desativado pre-lancamento — TrainersHighlight ("Acompanhamento
            profissional") escondida do carrossel. Nao apagar: so reativar esta linha
            quando o marketplace de profissionais for relancado. */}
        <DesafiosCarouselSlide />
      </ScrollView>

      {/* Marketplace desativado pre-lancamento — TrainerPartnerRow ("seja nosso
          parceiro") escondida. Nao apagar: so reativar esta linha quando o
          marketplace de profissionais for relancado. Ver TrainerPartnerRow.tsx. */}

      {/*
        Conteudo Pro existente (comparacao mensal, prontidao, insight do
        dia, recordes pessoais, resumo do periodo e evolucao de peso) — nao
        fazia parte da lista numerada de reorganizacao pedida, entao
        mantive tudo junto (mesma adjacencia de antes) e movi pro fim da
        Home: os itens 2-8 acima sao conteudo de "relance" + descoberta
        (gratuitos), enquanto isso aqui e relatorio/analise mais profunda
        (a maioria Pro) — faz mais sentido ficar depois, nao competindo com
        os cards de entrada rapida do topo. Decisao de design minha, nao
        especificada explicitamente no pedido.

        O navegador de mes ("< Últimos 30 dias >") NAO foi removido — so
        reposicionado pra dentro do titulo do card de estatisticas logo
        abaixo (styles.statsCard), que e o unico conteudo que ele de fato
        controla (getHomeSummary com viewMode.month). Ficava solto aqui em
        cima, sem nenhum card visivel ao lado pra explicar o que ele fazia
        — e a unica forma no app de ver o resumo de um mes especifico
        (confirmado: getHomeSummary com `month` so e chamado aqui), entao
        mantive a funcionalidade, so anexada ao lugar certo.
      */}
      <MonthComparisonCard />

      <ReadinessCard />

      {insightLoading && (
        <View style={styles.insightLoading}>
          <ActivityIndicator size="small" color={colors3.primary} />
        </View>
      )}
      {!insightLoading && !!insight && <InsightCard text={insight.insight_text} />}

      <PersonalRecordsCard />

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colors3.primary} style={styles.loading} />}

      {!loading && summary && (
        <>
          <GlassCard style={styles.statsCard}>
            <View style={styles.statsCardHeader}>
              <Pressable onPress={goToPreviousMonth} hitSlop={8} style={styles.monthArrow}>
                <Ionicons name="chevron-back" size={20} color={colors3.onSurfaceVariant} />
              </Pressable>
              <Text style={styles.statsCardTitle}>
                {viewMode.type === 'rolling' ? 'Últimos 30 dias' : monthLabel(viewMode.year, viewMode.month)}
              </Text>
              <Pressable
                onPress={goToNextMonth}
                hitSlop={8}
                style={styles.monthArrow}
                disabled={viewMode.type === 'rolling'}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={viewMode.type === 'rolling' ? colors3.outlineVariant : colors3.onSurfaceVariant}
                />
              </Pressable>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{weightChangeLabel}</Text>
                <Text style={styles.statLabel}>peso</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{summary.days_trained}</Text>
                <Text style={styles.statLabel}>dias treinados</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{deficitLabel}</Text>
                <Text style={styles.statLabel}>kcal déficit/dia</Text>
              </View>
            </View>
          </GlassCard>

          <LiquiglassCard style={styles.sectionCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Evolução de peso</Text>
              <Pressable onPress={() => router.push('/weight/new')} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={22} color={colors2.primary} />
              </Pressable>
            </View>
            <WeightChart data={summary.weight_evolution} />
          </LiquiglassCard>
        </>
      )}
    </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  forYouTitle: { ...typography3.labelMd, textTransform: 'uppercase', color: colors3.onSurfaceVariant, marginBottom: -spacing3.xs },
  forYouScroll: { marginHorizontal: -spacing3.containerMargin },
  forYouRow: { gap: spacing3.md, paddingHorizontal: spacing3.containerMargin },
  flex: { flex: 1 },
  container: { padding: spacing3.containerMargin, gap: spacing3.xl },
  headerBlock: { gap: spacing3.md },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    ...typography3.displayLg,
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    color: colors3.primary,
  },
  header: { gap: spacing3.sm },
  greeting: { ...typography3.headlineLgMobile },
  dateLabel: { ...typography3.labelSm, color: colors3.onSurfaceVariant, textTransform: 'uppercase' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  logoutButton: {
    width: 32,
    height: 32,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  monthArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors3.error, textAlign: 'center' },
  loading: { marginTop: spacing3.lg },
  insightLoading: { alignItems: 'flex-start', paddingVertical: spacing3.xs },
  // statsCard (navegador de mes + peso/dias treinados/deficit) migrado pro
  // tema claro nesta tarefa -- cardTitle abaixo continua colors2/typography2
  // de proposito, ainda usado pelo sectionCard ("Evolucao de peso", fora de
  // escopo aqui), por isso statsCardTitle tem sua propria tipografia
  // completa em vez de estender cardTitle.
  statsCard: { gap: spacing3.md },
  statsCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsCardTitle: { ...typography3.headlineMd, fontSize: 18, flex: 1, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start', flex: 1 },
  statNumber: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22, color: colors3.onSurface },
  statLabel: { ...typography3.labelSm, textTransform: 'none', marginTop: spacing3.xs },

  cardTitle: { ...typography2.headlineMd, fontSize: 18 },
  sectionCard: { gap: spacing2.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
