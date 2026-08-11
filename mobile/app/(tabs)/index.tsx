import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { InsightCard } from '@/components/InsightCard';
import { MonthComparisonCard } from '@/components/MonthComparisonCard';
import { PersonalRecordsCard } from '@/components/PersonalRecordsCard';
import { ReadinessCard } from '@/components/ReadinessCard';
import { TrainersHighlight } from '@/components/TrainersHighlight';
import { TrainingCalendar } from '@/components/TrainingCalendar';
import { WeightChart } from '@/components/WeightChart';
import { getApiErrorMessage } from '@/services/api';
import { HomeSummary, getHomeSummary } from '@/services/dashboard';
import { DailyInsight, getDailyInsight } from '@/services/insights';
import { exportPeriodReportPdf } from '@/services/pdfExport';
import { subscribeToDashboardChanges } from '@/utils/dashboardEvents';
import { colors, radius, spacing, typography } from '@/constants/theme';

type ViewMode = { type: 'rolling' } | { type: 'month'; year: number; month: number };

function monthLabel(year: number, month: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? '';

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
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu resumo.'));
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
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Ola, {firstName}</Text>
          <Text style={styles.subtitle}>Vamos treinar hoje?</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton} hitSlop={12}>
          <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ReadinessCard />

      <MonthComparisonCard />

      <PersonalRecordsCard />

      {insightLoading && (
        <View style={styles.insightLoading}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}
      {!insightLoading && !!insight && <InsightCard text={insight.insight_text} />}

      <View style={styles.monthSelector}>
        <Pressable onPress={goToPreviousMonth} hitSlop={8} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {viewMode.type === 'rolling' ? 'Ultimos 30 dias' : monthLabel(viewMode.year, viewMode.month)}
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
            color={viewMode.type === 'rolling' ? colors.textMuted : colors.textSecondary}
          />
        </Pressable>
      </View>

      <View style={styles.exportRow}>
        <Text style={styles.exportLabel}>Exportar relatorio em PDF</Text>
        <View style={styles.exportButtons}>
          <Pressable
            onPress={() => handleExportPdf(7)}
            disabled={exportingDays !== null}
            style={styles.exportButton}
            hitSlop={8}
          >
            {exportingDays === 7 ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="document-text-outline" size={16} color={colors.accent} />
            )}
            <Text style={styles.exportButtonText}>Ultimos 7 dias</Text>
          </Pressable>
          <Pressable
            onPress={() => handleExportPdf(30)}
            disabled={exportingDays !== null}
            style={styles.exportButton}
            hitSlop={8}
          >
            {exportingDays === 30 ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="document-text-outline" size={16} color={colors.accent} />
            )}
            <Text style={styles.exportButtonText}>Ultimos 30 dias</Text>
          </Pressable>
        </View>
      </View>
      {!!exportError && <Text style={styles.error}>{exportError}</Text>}

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}

      {!loading && summary && (
        <>
          <Card style={styles.statsCard}>
            <Text style={styles.cardTitle}>
              {viewMode.type === 'rolling' ? 'Ultimos 30 dias' : monthLabel(viewMode.year, viewMode.month)}
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
                <Text style={styles.statLabel}>kcal deficit/dia</Text>
              </View>
            </View>
          </Card>

          <Card style={styles.sectionCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Evolucao de peso</Text>
              <Pressable onPress={() => router.push('/weight/new')} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
              </Pressable>
            </View>
            <WeightChart data={summary.weight_evolution} />
          </Card>

          <Card style={styles.sectionCard}>
            <Text style={styles.cardTitle}>Frequencia de treino</Text>
            <TrainingCalendar data={summary.training_frequency} />
          </Card>
        </>
      )}

      <Pressable onPress={() => router.push('/activity')}>
        <Card style={styles.placeholderCard}>
          <View style={styles.placeholderIconWrap}>
            <Ionicons name="flame" size={24} color={colors.accent} />
          </View>
          <Text style={styles.cardTitle}>Atividades</Text>
          <Text style={styles.placeholderText}>
            Registre uma corrida, pedalada ou atividade manual e veja seu historico aqui.
          </Text>
        </Card>
      </Pressable>

      <TrainersHighlight />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  greeting: { ...typography.h1 },
  subtitle: { ...typography.bodySecondary, marginTop: spacing.xs },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  monthArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { ...typography.body, fontWeight: '600', minWidth: 140, textAlign: 'center' },
  exportRow: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  exportLabel: { ...typography.caption },
  exportButtons: { flexDirection: 'row', gap: spacing.lg },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  exportButtonText: { ...typography.bodySecondary, color: colors.accent, fontWeight: '700' },
  error: { color: colors.danger, textAlign: 'center' },
  loading: { marginTop: spacing.lg },
  insightLoading: { alignItems: 'flex-start', paddingVertical: spacing.xs },
  statsCard: { gap: spacing.md },
  cardTitle: { ...typography.h3 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start', flex: 1 },
  statNumber: { ...typography.statNumber, fontSize: 24 },
  statLabel: { ...typography.statLabel, marginTop: spacing.xs },

  sectionCard: { gap: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  placeholderCard: { alignItems: 'flex-start', gap: spacing.sm },
  placeholderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  placeholderText: { ...typography.bodySecondary },
});
