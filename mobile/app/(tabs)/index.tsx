import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { InsightCard } from '@/components/InsightCard';
import { TrainingCalendar } from '@/components/TrainingCalendar';
import { WeightChart } from '@/components/WeightChart';
import { getApiErrorMessage } from '@/services/api';
import { HomeSummary, getHomeSummary } from '@/services/dashboard';
import { DailyInsight, getDailyInsight } from '@/services/insights';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? '';

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
      setSummary(await getHomeSummary('30d'));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar seu resumo.'));
    } finally {
      setLoading(false);
    }
  }, []);

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

      {insightLoading && (
        <View style={styles.insightLoading}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}
      {!insightLoading && !!insight && <InsightCard text={insight.insight_text} />}

      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}

      {!loading && summary && (
        <>
          <Card style={styles.statsCard}>
            <Text style={styles.cardTitle}>Ultimos 30 dias</Text>
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
