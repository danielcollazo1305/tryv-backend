import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { AiWorkoutCard } from '@/components/AiWorkoutCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { HealthMetricsGrid } from '@/components/HealthMetricsGrid';
import { ImageCoverCard } from '@/components/ImageCoverCard';
import { InsightCard } from '@/components/InsightCard';
import { MonthComparisonCard } from '@/components/MonthComparisonCard';
import { PersonalRecordsCard } from '@/components/PersonalRecordsCard';
import { ReadinessCard } from '@/components/ReadinessCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TrainersHighlight } from '@/components/TrainersHighlight';
import { TrainingFrequencyCard } from '@/components/TrainingFrequencyCard';
import { WeeklyActivityChart } from '@/components/WeeklyActivityChart';
import { WeightChart } from '@/components/WeightChart';
import { getApiErrorMessage } from '@/services/api';
import { HomeSummary, getHomeSummary } from '@/services/dashboard';
import { DailyInsight, getDailyInsight } from '@/services/insights';
import { exportPeriodReportPdf } from '@/services/pdfExport';
import { subscribeToDashboardChanges } from '@/utils/dashboardEvents';
import { colors2, spacing2, typography2 } from '@/constants/theme';

type ViewMode = { type: 'rolling' } | { type: 'month'; year: number; month: number };

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

  const [exportingDays, setExportingDays] = useState<7 | 30 | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const handleExportPdf = async (days: 7 | 30) => {
    setExportingDays(days);
    setExportError(null);
    try {
      await exportPeriodReportPdf(user?.name ?? '', days);
    } catch (err) {
      setExportError(getApiErrorMessage(err, 'Nao foi possivel exportar o relatorio em PDF.'));
    } finally {
      setExportingDays(null);
    }
  };

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
    <ScreenBackground2>
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing2.xl }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {firstName}</Text>
          <Text style={styles.subtitle}>Vamos treinar hoje?</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton} hitSlop={12}>
          <Ionicons name="log-out-outline" size={22} color={colors2.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* 2. Card de Saude — primeiro bloco de conteudo depois da saudacao. */}
      <HealthMetricsGrid />

      {/* 3. Km rodados (Run, estilo Strava) — troca de "Atividades"/minutos. */}
      <Pressable onPress={() => router.push('/activity')}>
        <LiquiglassCard style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Km rodados</Text>
            <Ionicons name="chevron-forward" size={18} color={colors2.onSurfaceVariant} />
          </View>
          <WeeklyActivityChart />
        </LiquiglassCard>
      </Pressable>

      {/* 4. Frequencia de treino — heatmap estilo GitHub. */}
      <TrainingFrequencyCard />

      {/* 5. Exportar PDF — nao mexido, so reposicionado. */}
      <LiquiglassCard style={styles.exportCard}>
        <Text style={styles.exportLabel}>Exportar relatório em PDF</Text>
        <View style={styles.exportButtons}>
          <Pressable
            onPress={() => handleExportPdf(7)}
            disabled={exportingDays !== null}
            style={styles.exportButton}
            hitSlop={8}
          >
            {exportingDays === 7 ? (
              <ActivityIndicator size="small" color={colors2.primary} />
            ) : (
              <Ionicons name="document-text-outline" size={16} color={colors2.primary} />
            )}
            <Text style={styles.exportButtonText}>Últimos 7 dias</Text>
          </Pressable>
          <Pressable
            onPress={() => handleExportPdf(30)}
            disabled={exportingDays !== null}
            style={styles.exportButton}
            hitSlop={8}
          >
            {exportingDays === 30 ? (
              <ActivityIndicator size="small" color={colors2.primary} />
            ) : (
              <Ionicons name="document-text-outline" size={16} color={colors2.primary} />
            )}
            <Text style={styles.exportButtonText}>Últimos 30 dias</Text>
          </Pressable>
        </View>
        {!!exportError && <Text style={styles.error}>{exportError}</Text>}
      </LiquiglassCard>

      {/* 6. Desafios — imagem de capa, sem contador (sem endpoint agregado pronto, ver investigacao). */}
      <ImageCoverCard
        image={require('../../assets/imagens/desafios-card.png')}
        title="Desafios"
        subtitle="Acompanhe desafios dos seus profissionais"
        accessibilityLabel="Grupo de pessoas correndo a noite"
        onPress={() => router.push('/challenges')}
      />

      {/* 7. Treino com IA — novo. */}
      <AiWorkoutCard />

      {/* 8. Acompanhamento profissional — agora fluxo em 2 passos (ver TrainersHighlight). */}
      <TrainersHighlight />

      {/*
        Conteudo Pro existente (comparacao mensal, seletor de mes,
        prontidao, insight do dia, recordes pessoais, resumo do periodo e
        evolucao de peso) — nao fazia parte da lista numerada de reorganizacao
        pedida, entao mantive tudo junto (mesma adjacencia de antes) e movi
        pro fim da Home: os itens 2-8 acima sao conteudo de "relance" +
        descoberta (gratuitos), enquanto isso aqui e relatorio/analise mais
        profunda (a maioria Pro) — faz mais sentido ficar depois, nao
        competindo com os cards de entrada rapida do topo. Decisao de
        design minha, nao especificada explicitamente no pedido.
      */}
      <View style={styles.monthSelector}>
        <Pressable onPress={goToPreviousMonth} hitSlop={8} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={20} color={colors2.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.monthLabel}>
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
            color={viewMode.type === 'rolling' ? colors2.outlineVariant : colors2.onSurfaceVariant}
          />
        </Pressable>
      </View>

      <MonthComparisonCard />

      <ReadinessCard />

      {insightLoading && (
        <View style={styles.insightLoading}>
          <ActivityIndicator size="small" color={colors2.violet} />
        </View>
      )}
      {!insightLoading && !!insight && <InsightCard text={insight.insight_text} />}

      <PersonalRecordsCard />

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colors2.violet} style={styles.loading} />}

      {!loading && summary && (
        <>
          <LiquiglassCard style={styles.statsCard}>
            <Text style={styles.cardTitle}>
              {viewMode.type === 'rolling' ? 'Últimos 30 dias' : monthLabel(viewMode.year, viewMode.month)}
            </Text>
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
          </LiquiglassCard>

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
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing2.containerMargin, gap: spacing2.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing2.md,
  },
  greeting: { ...typography2.headlineLgMobile, fontSize: 26 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginTop: spacing2.xs },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: colors2.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.md,
    marginBottom: spacing2.sm,
  },
  monthArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { ...typography2.bodyMd, fontWeight: '600', minWidth: 140, textAlign: 'center' },
  exportCard: { alignItems: 'center', gap: spacing2.xs },
  exportLabel: { ...typography2.labelCaps, textTransform: 'none' },
  exportButtons: { flexDirection: 'row', gap: spacing2.lg },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.xs,
    paddingVertical: spacing2.sm,
  },
  exportButtonText: { ...typography2.bodyMd, fontSize: 14, color: colors2.primary, fontWeight: '700' },
  error: { color: colors2.danger, textAlign: 'center' },
  loading: { marginTop: spacing2.lg },
  insightLoading: { alignItems: 'flex-start', paddingVertical: spacing2.xs },
  statsCard: { gap: spacing2.md },
  cardTitle: { ...typography2.headlineMd, fontSize: 18 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start', flex: 1 },
  statNumber: { ...typography2.metricMono, fontSize: 22 },
  statLabel: { ...typography2.labelCaps, textTransform: 'none', marginTop: spacing2.xs },

  sectionCard: { gap: spacing2.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
