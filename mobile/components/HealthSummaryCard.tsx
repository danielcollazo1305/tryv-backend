import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { Card } from '@/components/Card';
import { formatDistanceKm } from '@/services/activities';
import {
  fetchHealthSummary,
  HealthSummary,
  isHealthKitAvailable,
  requestHealthKitPermissions,
} from '@/services/healthkit';
import { colors, radius, spacing, typography } from '@/constants/theme';

const CONNECTED_KEY = 'healthkit_connected';

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
        const alreadyConnected = (await SecureStore.getItemAsync(CONNECTED_KEY)) === 'true';
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
        await SecureStore.setItemAsync(CONNECTED_KEY, 'true');
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
      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.stepsToday != null ? summary.stepsToday.toLocaleString('pt-BR') : '--'}
          </Text>
          <Text style={styles.summaryLabel}>passos hoje</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.steps7d != null ? summary.steps7d.toLocaleString('pt-BR') : '--'}
          </Text>
          <Text style={styles.summaryLabel}>passos (7 dias)</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.distanceTodayMeters != null ? formatDistanceKm(summary.distanceTodayMeters) : '--'}
          </Text>
          <Text style={styles.summaryLabel}>km hoje</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.activeEnergyTodayKcal != null ? Math.round(summary.activeEnergyTodayKcal) : '--'}
          </Text>
          <Text style={styles.summaryLabel}>kcal ativas hoje</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.heartRate.mostRecentBpm ?? '--'}</Text>
          <Text style={styles.summaryLabel}>
            {summary.heartRate.mostRecentAt
              ? `bpm  •  ${formatHeartRateDate(summary.heartRate.mostRecentAt)}`
              : 'frequencia cardiaca'}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {summary.sleepLastNightHours != null ? `${summary.sleepLastNightHours.toFixed(1)}h` : '--'}
          </Text>
          <Text style={styles.summaryLabel}>sono (ultima noite)</Text>
        </View>
      </View>
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

  summaryCard: { gap: spacing.md },
  cardTitle: { ...typography.h3 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryItem: { width: '30%', gap: spacing.xs },
  summaryValue: { ...typography.statNumber, fontSize: 20 },
  summaryLabel: { ...typography.statLabel },
});
