import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { HeartRateChart } from '@/components/HeartRateChart';
import { ProGate } from '@/components/ProGate';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { HeartRateReport, getHeartRateReport } from '@/services/heartRate';
import { colors3, spacing3, typography3 } from '@/constants/theme';

/**
 * Migrada pro tema claro "prism-glass" (colors3/GlassCard/ScreenBackground3,
 * mesmo padrao de (auth)/register.tsx) junto com o ProGate: sem Pro
 * (isPro === false) a tela mostra o aviso em tela cheia em vez de chamar o
 * endpoint (que devolveria 402). isPro null (ainda carregando/falhou) segue o
 * fluxo normal -- null nunca e tratado como "sem Pro".
 */
export default function HeartRateReportScreen() {
  const { isPro } = useAuth();
  const [report, setReport] = useState<HeartRateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (isPro === false) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await getHeartRateReport());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o relatorio de frequencia cardiaca.'));
    } finally {
      setLoading(false);
    }
  }, [isPro]);

  useFocusEffect(
    useCallback(() => {
      fetchReport();
    }, [fetchReport])
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Relatório de FC</Text>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="close" size={26} color={colors3.onSurfaceVariant} />
      </Pressable>
    </View>
  );

  if (isPro === false) {
    return (
      <ScreenBackground3 style={styles.flex}>
        {header}
        <ProGate
          variant="fullscreen"
          title="Relatório de frequência cardíaca"
          subtitle="Assine o Tryv Fit Pro para ver a análise detalhada da sua FC ao longo dos treinos."
        >
          <View style={styles.content}>
            <GlassCard style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>--</Text>
                  <Text style={styles.statLabel}>FC média (bpm)</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>--</Text>
                  <Text style={styles.statLabel}>FC máxima (bpm)</Text>
                </View>
              </View>
            </GlassCard>
            <GlassCard style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Tendência diária</Text>
              <View style={styles.chartPlaceholder} />
            </GlassCard>
          </View>
        </ProGate>
      </ScreenBackground3>
    );
  }

  return (
    <ScreenBackground3 style={styles.flex}>
      {header}

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors3.primary} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && report && (
          <>
            <Text style={styles.periodLabel}>Últimos {report.period_days} dias</Text>

            <GlassCard style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>
                    {report.avg_bpm != null ? Math.round(report.avg_bpm) : '--'}
                  </Text>
                  <Text style={styles.statLabel}>FC média (bpm)</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{report.max_bpm != null ? report.max_bpm : '--'}</Text>
                  <Text style={styles.statLabel}>FC máxima (bpm)</Text>
                </View>
              </View>
            </GlassCard>

            <GlassCard style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Tendência diária</Text>
              <HeartRateChart data={report.daily} />
            </GlassCard>

            <GlassCard style={styles.restingCard}>
              <View style={styles.restingHeader}>
                <Ionicons name="moon-outline" size={18} color={colors3.primary} />
                <Text style={styles.cardTitle}>FC de repouso (estimada)</Text>
              </View>
              <Text style={styles.restingValue}>
                {report.resting_estimate.bpm != null ? `${Math.round(report.resting_estimate.bpm)} bpm` : '--'}
              </Text>
              <View style={styles.disclaimer}>
                <Ionicons name="information-circle-outline" size={16} color={colors3.onSurfaceVariant} />
                <Text style={styles.disclaimerText}>{report.resting_estimate.note}</Text>
              </View>
            </GlassCard>
          </>
        )}
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
  title: { ...typography3.headlineMd, fontSize: 22 },
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.md },
  centered: { alignItems: 'center', marginTop: spacing3.xl },
  error: { ...typography3.bodyMd, color: colors3.error, textAlign: 'center' },

  periodLabel: { ...typography3.labelSm, textTransform: 'none' },

  statsCard: { gap: spacing3.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', flex: 1 },
  statNumber: { ...typography3.headlineLg, fontSize: 32, lineHeight: 38 },
  statLabel: { ...typography3.labelSm, textTransform: 'none', marginTop: spacing3.xs },

  sectionCard: { gap: spacing3.md },
  cardTitle: { ...typography3.headlineMd, fontSize: 18 },
  chartPlaceholder: { height: 200 },

  restingCard: { gap: spacing3.sm },
  restingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  restingValue: { ...typography3.headlineLg, fontSize: 28, lineHeight: 34 },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing3.xs,
    backgroundColor: colors3.surfaceContainer,
    borderRadius: 8,
    padding: spacing3.sm,
  },
  disclaimerText: { ...typography3.labelSm, textTransform: 'none', flex: 1 },
});
