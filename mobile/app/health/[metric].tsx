import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { HealthHistoryCard, HEALTH_METRIC_CONFIG, useHealthHistory } from '@/components/HealthHistoryCard';
import { HeartRateDetailView } from '@/components/HeartRateDetailView';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { SleepDetailView } from '@/components/SleepDetailView';
import { HEALTH_SOURCE_LABEL, HealthHistoryPeriod, HealthMetricKey } from '@/services/health';
import { colors3, spacing3, typography3 } from '@/constants/theme';

function isMetricKey(value: string | undefined): value is HealthMetricKey {
  return !!value && value in HEALTH_METRIC_CONFIG;
}

/**
 * Tela de detalhe de uma metrica de Saude (Batimentos/Passos/Sono/Calorias),
 * aberta ao tocar um tile do HealthMetricsGrid na Home. Mesmo padrao visual
 * e estrutural do historico de Refeicoes (MealsHistoryCard/getMealsSummary):
 * seletor de periodo 1D/7D/4SEM/1ANO, navegacao "< >" entre janelas, lista
 * de dias/meses e grafico de barras — aqui a fonte e o HealthKit local
 * (services/healthkit.ts, fetchHealthMetricHistory) em vez do backend,
 * entao a janela/offset e resolvida no proprio cliente. O card em si vive
 * em components/HealthHistoryCard (compartilhado com o Sono).
 */
export default function HealthMetricDetailScreen() {
  const { metric: rawMetric } = useLocalSearchParams<{ metric: string }>();
  const metric = isMetricKey(rawMetric) ? rawMetric : null;
  const config = metric ? HEALTH_METRIC_CONFIG[metric] : null;
  // Sono e Frequencia cardiaca tem tela propria (SleepDetailView /
  // HeartRateDetailView) — nao usam o fluxo generico de periodo/historico
  // deste componente, e cuidam da propria checagem de disponibilidade/
  // autorizacao sozinhas.
  const usesGenericHistory = metric !== null && metric !== 'sleep' && metric !== 'heartRate';

  const [period, setPeriod] = React.useState<HealthHistoryPeriod>('7d');
  const state = useHealthHistory(metric, period, usesGenericHistory);

  const handleChangePeriod = (value: HealthHistoryPeriod) => {
    setPeriod(value);
    state.setOffset(0);
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          {!!config && <View style={[styles.headerDot, { backgroundColor: config.color }]} />}
          <Text style={styles.headerTitle}>{config?.label ?? 'Saude'}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!config || !metric ? (
          <Text style={styles.error}>Metrica invalida.</Text>
        ) : metric === 'sleep' ? (
          <SleepDetailView />
        ) : metric === 'heartRate' ? (
          <HeartRateDetailView />
        ) : state.status === 'unavailable' ? (
          <Text style={styles.emptyText}>
            {Platform.OS === 'android'
              ? 'Instale ou atualize o app Health Connect pra ver seu historico de saude aqui.'
              : 'Historico de saude disponivel so no iPhone, via Apple Health.'}
          </Text>
        ) : state.status === 'disconnected' ? (
          <Pressable style={styles.connectHint} onPress={() => router.push('/activity')} hitSlop={8}>
            <Text style={styles.connectHintText}>Nenhum dado sincronizado ainda. Conectar {HEALTH_SOURCE_LABEL}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors3.primary} />
          </Pressable>
        ) : state.status === 'error' ? (
          <Text style={styles.error}>Nao foi possivel carregar o historico.</Text>
        ) : (
          <HealthHistoryCard
            metric={metric}
            config={config}
            state={state}
            period={period}
            onChangePeriod={handleChangePeriod}
          />
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
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.xs },
  headerDot: { width: 8, height: 8, borderRadius: 3 },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.lg, paddingBottom: spacing3.xl },

  error: { color: colors3.error, textAlign: 'center', marginTop: spacing3.xl },
  emptyText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center', marginTop: spacing3.xl },

  connectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing3.xl,
  },
  connectHintText: { ...typography3.bodyMd, color: colors3.primary, fontWeight: '700' },
});
