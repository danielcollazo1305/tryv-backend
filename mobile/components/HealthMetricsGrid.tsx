import React, { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { HealthMetricKey, HealthSummary, fetchHealthSummary, isHealthKitAvailable } from '@/services/healthkit';
import { colors2, metricColors, radius2, spacing2, typography2 } from '@/constants/theme';

type Status = 'checking' | 'unavailable' | 'disconnected' | 'ready' | 'error';

// Referencias fixas de bem-estar geral (nao personalizadas, nao vem do
// backend) usadas SO pra dar proporcao visual a barra secundaria de cada
// tile — nao sao "metas do usuario" reais. Passos: diretriz publica comum
// de 10.000/dia. Sono: 8h, recomendacao padrao de adultos. Calorias
// ativas: ~500kcal, referencia solta de "dia com atividade moderada" (nao
// ha meta personalizada nenhuma no backend pra isso). FC: posiciona o
// valor dentro da faixa fisiologica tipica de repouso/atividade leve
// (40-120bpm) so como indicador visual de posicao, nao meta.
const STEPS_REFERENCE = 10000;
const SLEEP_REFERENCE_HOURS = 8;
const ACTIVE_ENERGY_REFERENCE_KCAL = 500;
const HR_RANGE = { min: 40, max: 120 };

interface Tile {
  key: HealthMetricKey;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  value: string;
  progress: number | null; // 0-1, null = sem barra (sem dado)
}

/**
 * Card novo da Home: grid 2x2 com batimentos, passos, sono e calorias.
 * Reaproveita o MESMO servico ja usado pelo card de Apple Health da tela
 * de Atividades (services/healthkit.ts, fetchHealthSummary) — leitura
 * nativa do HealthKit, nao as tabelas smartwatch_data/heart_rate_samples
 * do backend (que existem mas nao sao escritas pelo app hoje; ver relatorio
 * de investigacao). So iOS tem HealthKit — Android nunca mostra este card,
 * mesmo padrao ja usado por HealthSummaryCard.
 *
 * Cada tile e tocavel e leva pra app/health/[metric].tsx (historico com
 * periodo 1D/7D/4SEM/1ANO + navegacao "< >", fetchHealthMetricHistory) —
 * a navegacao acontece independente do status aqui (mesmo com '--'), a
 * tela de detalhe faz sua propria checagem de conexao/permissao.
 */
export function HealthMetricsGrid() {
  const [status, setStatus] = useState<Status>('checking');
  const [summary, setSummary] = useState<HealthSummary | null>(null);

  const load = useCallback(async () => {
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
      const connected = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
      if (!connected) {
        setStatus('disconnected');
        return;
      }
      setSummary(await fetchHealthSummary());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (status === 'unavailable') return null;

  const tiles: Tile[] = [
    {
      key: 'heartRate',
      icon: 'heart',
      color: metricColors.heartRate,
      label: 'Batimentos',
      value: summary?.heartRate.mostRecentBpm != null ? `${summary.heartRate.mostRecentBpm}` : '--',
      progress:
        summary?.heartRate.mostRecentBpm != null
          ? clamp01((summary.heartRate.mostRecentBpm - HR_RANGE.min) / (HR_RANGE.max - HR_RANGE.min))
          : null,
    },
    {
      key: 'steps',
      icon: 'footsteps',
      color: metricColors.steps,
      label: 'Passos',
      value: summary?.stepsToday != null ? summary.stepsToday.toLocaleString('pt-BR') : '--',
      progress: summary?.stepsToday != null ? clamp01(summary.stepsToday / STEPS_REFERENCE) : null,
    },
    {
      key: 'sleep',
      icon: 'moon',
      color: metricColors.sleep,
      label: 'Sono',
      value: summary?.sleepLastNightHours != null ? `${summary.sleepLastNightHours.toFixed(1)}h` : '--',
      progress:
        summary?.sleepLastNightHours != null
          ? clamp01(summary.sleepLastNightHours / SLEEP_REFERENCE_HOURS)
          : null,
    },
    {
      key: 'calories',
      icon: 'flame',
      color: metricColors.energy,
      label: 'Calorias ativas',
      value: summary?.activeEnergyTodayKcal != null ? `${summary.activeEnergyTodayKcal}` : '--',
      progress:
        summary?.activeEnergyTodayKcal != null
          ? clamp01(summary.activeEnergyTodayKcal / ACTIVE_ENERGY_REFERENCE_KCAL)
          : null,
    },
  ];

  const showConnectHint = status === 'disconnected' || status === 'error' || status === 'checking';

  return (
    <LiquiglassCard style={styles.card}>
      <Text style={styles.cardTitle}>Saude</Text>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            style={styles.tile}
            onPress={() => router.push({ pathname: '/health/[metric]', params: { metric: tile.key } })}
          >
            <View style={[styles.iconWrap, { backgroundColor: hexToRgba(tile.color, 0.12) }]}>
              <Ionicons name={tile.icon} size={18} color={tile.color} />
            </View>
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileValue}>{tile.value}</Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(tile.progress ?? 0) * 100}%`, backgroundColor: tile.color },
                ]}
              />
            </View>
          </Pressable>
        ))}
      </View>

      {showConnectHint && (
        <Pressable style={styles.connectHint} onPress={() => router.push('/activity')} hitSlop={8}>
          <Text style={styles.connectHintText}>
            {status === 'error' ? 'Nao foi possivel carregar seus dados de saude.' : 'Nenhum dado sincronizado ainda.'}{' '}
            Conectar Apple Health
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors2.primary} />
        </Pressable>
      )}
    </LiquiglassCard>
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** As cores de metrica sao hex fixo (#RRGGBB) — converte pra rgba() (mesmo utilitario de HealthWeeklyBarChart.tsx). */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const styles = StyleSheet.create({
  card: { gap: spacing2.md },
  cardTitle: { ...typography2.headlineMd, fontSize: 18 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing2.sm },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing2.xs,
    padding: spacing2.md,
    borderRadius: radius2.md,
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius2.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
  tileValue: { ...typography2.metricMono, fontSize: 22 },
  progressTrack: {
    height: 4,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: { height: '100%', borderRadius: radius2.pill },

  connectHint: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: spacing2.xs },
  connectHintText: {
    ...typography2.labelCaps,
    textTransform: 'none',
    color: colors2.primary,
    fontWeight: '700',
    flex: 1,
  },
});
