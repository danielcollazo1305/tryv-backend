import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { Card } from '@/components/Card';
import { HealthMetricRow } from '@/components/HealthMetricRow';
import { HealthWeeklyBarChart } from '@/components/HealthWeeklyBarChart';
import { formatDistanceKm } from '@/services/activities';
import {
  fetchActiveEnergyLast7Days,
  fetchHealthSummary,
  fetchStepsLast7Days,
  HealthSummary,
  isHealthKitAvailable,
  requestHealthKitPermissions,
} from '@/services/healthkit';
import { syncRecentHeartRate } from '@/services/heartRateSync';
import { colors, metricColors, radius, spacing, typography } from '@/constants/theme';

// So guarda "o usuario ja passou pelo fluxo de conectar" — nao revela se
// cada tipo de dado foi de fato autorizado (o HealthKit nao expoe isso por
// privacidade), so evita mostrar o card de "Conectar" de novo a cada abertura
// do app depois que o usuario ja decidiu uma vez. Exportada porque outros
// consumidores de HealthKit (ex: ReadinessCard) tambem precisam saber se o
// usuario ja passou por esse fluxo, sem duplicar o proprio fluxo de conexao.
export const HEALTHKIT_CONNECTED_KEY = 'healthkit_connected';

function formatHeartRateDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 'disconnected' = nunca conectou (ou a flag realmente sumiu); 'error' = a
// flag diz que ja esta conectado, mas ESSA busca falhou — dois estados
// visualmente diferentes de proposito, pra nao fazer uma falha passageira de
// rede parecer "voce precisa conectar de novo" (o que reabriria o dialogo de
// permissao do sistema a toa).
type Status = 'checking' | 'unavailable' | 'disconnected' | 'loading' | 'ready' | 'error';

/**
 * Card auto-contido: verifica disponibilidade/conexao com o Apple Health,
 * busca o resumo e se conecta sozinho. Falhas ficam contidas aqui (mesmo
 * padrao do InsightCard da Home) — nunca impedem o resto da tela de
 * Atividades de funcionar.
 */
export function HealthSummaryCard() {
  const [status, setStatus] = useState<Status>('checking');
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [connecting, setConnecting] = useState(false);

  const loadSummary = useCallback(async (isRetry = false) => {
    setStatus('loading');
    try {
      setSummary(await fetchHealthSummary());
      setStatus('ready');
      // Fire-and-forget: alimenta o Score de Prontidao e o Live Activity com
      // FC real, sem atrasar nem arriscar o card por causa disso (tem seu
      // proprio throttle interno, ver services/heartRateSync.ts).
      syncRecentHeartRate().catch(() => {});
    } catch {
      if (!isRetry) {
        // Logo apos autorizar (ou ao reabrir a tela), o HealthKit as vezes
        // leva um instante pra um tipo recem-liberado ficar pronto pra
        // consulta — uma segunda tentativa curta evita mostrar erro por
        // causa dessa janela de corrida.
        await new Promise((resolve) => setTimeout(resolve, 800));
        await loadSummary(true);
        return;
      }
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'ios') {
        setStatus('unavailable');
        return;
      }
      try {
        const available = await isHealthKitAvailable();
        if (!available) {
          setStatus('unavailable');
          return;
        }
        const alreadyConnected = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
        if (alreadyConnected) {
          await loadSummary();
        } else {
          setStatus('disconnected');
        }
      } catch {
        setStatus('unavailable');
      }
    })();
  }, [loadSummary]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const granted = await requestHealthKitPermissions();
      if (granted) {
        await SecureStore.setItemAsync(HEALTHKIT_CONNECTED_KEY, 'true');
        await loadSummary();
      }
    } catch {
      // silencioso de proposito — o card continua visivel pra tentar de novo
    } finally {
      setConnecting(false);
    }
  };

  if (status === 'checking' || status === 'unavailable') return null;

  if (status === 'disconnected') {
    return (
      <Pressable onPress={handleConnect} disabled={connecting}>
        <Card style={styles.connectCard}>
          <View style={styles.connectIconWrap}>
            <Ionicons name="heart" size={20} color={colors.accent} />
          </View>
          <View style={styles.connectInfo}>
            <Text style={styles.connectTitle}>Conectar Apple Health</Text>
            <Text style={styles.connectSubtitle}>
              Veja passos, distancia, frequencia cardiaca, calorias e sono aqui.
            </Text>
          </View>
          {connecting ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </Card>
      </Pressable>
    );
  }

  if (status === 'loading') {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <Pressable onPress={() => loadSummary()}>
        <Card style={styles.connectCard}>
          <View style={styles.connectIconWrap}>
            <Ionicons name="refresh" size={20} color={colors.accent} />
          </View>
          <View style={styles.connectInfo}>
            <Text style={styles.connectTitle}>Nao foi possivel carregar o Apple Health</Text>
            <Text style={styles.connectSubtitle}>Toque para tentar novamente.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>
    );
  }

  if (!summary) return null;

  return (
    <Card style={styles.summaryCard}>
      <Text style={styles.cardTitle}>Apple Health</Text>

      <HealthMetricRow
        icon="footsteps"
        color={metricColors.steps}
        label="Passos"
        value={summary.stepsToday != null ? summary.stepsToday.toLocaleString('pt-BR') : '--'}
      >
        <HealthWeeklyBarChart fetcher={fetchStepsLast7Days} color={metricColors.steps} unitLabel="passos" />
      </HealthMetricRow>

      <HealthMetricRow
        icon="flame"
        color={metricColors.energy}
        label="Calorias ativas"
        value={summary.activeEnergyTodayKcal != null ? `${Math.round(summary.activeEnergyTodayKcal)} kcal` : '--'}
      >
        <HealthWeeklyBarChart fetcher={fetchActiveEnergyLast7Days} color={metricColors.energy} unitLabel="kcal" />
      </HealthMetricRow>

      <HealthMetricRow
        icon="navigate"
        color={metricColors.distance}
        label="Distancia"
        value={summary.distanceTodayMeters != null ? `${formatDistanceKm(summary.distanceTodayMeters)} km` : '--'}
      />

      <HealthMetricRow
        icon="heart"
        color={metricColors.heartRate}
        label="Frequencia cardiaca"
        subLabel={
          summary.heartRate.mostRecentAt ? formatHeartRateDate(summary.heartRate.mostRecentAt) : undefined
        }
        value={summary.heartRate.mostRecentBpm != null ? `${summary.heartRate.mostRecentBpm} bpm` : '--'}
      />

      <HealthMetricRow
        icon="moon"
        color={metricColors.sleep}
        label="Sono"
        subLabel="ultima noite"
        value={summary.sleepLastNightHours != null ? `${summary.sleepLastNightHours.toFixed(1)}h` : '--'}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  connectCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  connectIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectInfo: { flex: 1, gap: spacing.xs },
  connectTitle: { ...typography.body, fontWeight: '600' },
  connectSubtitle: { ...typography.caption },

  loadingWrap: { alignItems: 'flex-start', paddingVertical: spacing.xs },

  summaryCard: { gap: spacing.xs },
  cardTitle: { ...typography.h3, marginBottom: spacing.xs },
});
