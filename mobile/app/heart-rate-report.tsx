import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/Card';
import { HeartRateChart } from '@/components/HeartRateChart';
import { getApiErrorMessage } from '@/services/api';
import { HeartRateReport, getHeartRateReport } from '@/services/heartRate';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function HeartRateReportScreen() {
  const [report, setReport] = useState<HeartRateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getHeartRateReport());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o relatorio de frequencia cardiaca.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchReport();
    }, [fetchReport])
  );

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Relatorio de FC</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && report && (
          <>
            <Text style={styles.periodLabel}>Ultimos {report.period_days} dias</Text>

            <Card style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>
                    {report.avg_bpm != null ? Math.round(report.avg_bpm) : '--'}
                  </Text>
                  <Text style={styles.statLabel}>FC media (bpm)</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{report.max_bpm != null ? report.max_bpm : '--'}</Text>
                  <Text style={styles.statLabel}>FC maxima (bpm)</Text>
                </View>
              </View>
            </Card>

            <Card style={styles.sectionCard}>
              <Text style={styles.cardTitle}>Tendencia diaria</Text>
              <HeartRateChart data={report.daily} />
            </Card>

            <Card style={styles.restingCard}>
              <View style={styles.restingHeader}>
                <Ionicons name="moon-outline" size={18} color={colors.accent} />
                <Text style={styles.cardTitle}>FC de repouso (estimada)</Text>
              </View>
              <Text style={styles.restingValue}>
                {report.resting_estimate.bpm != null ? `${Math.round(report.resting_estimate.bpm)} bpm` : '--'}
              </Text>
              <View style={styles.disclaimer}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={styles.disclaimerText}>{report.resting_estimate.note}</Text>
              </View>
            </Card>
          </>
        )}
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
  centered: { alignItems: 'center', marginTop: spacing.xl },
  error: { color: colors.danger, textAlign: 'center' },

  periodLabel: { ...typography.bodySecondary },

  statsCard: { gap: spacing.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', flex: 1 },
  statNumber: { ...typography.statNumber, fontSize: 32 },
  statLabel: { ...typography.statLabel, marginTop: spacing.xs },

  sectionCard: { gap: spacing.md },
  cardTitle: { ...typography.h3 },

  restingCard: { gap: spacing.sm },
  restingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  restingValue: { ...typography.statNumber, fontSize: 28 },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  disclaimerText: { ...typography.caption, flex: 1 },
});
