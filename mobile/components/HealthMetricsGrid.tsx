import React, { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { GlassCard } from '@/components/GlassCard';
import {
  ensureHealthAuthorized,
  fetchHealthSummary,
  HEALTHKIT_CONNECTED_KEY,
  HealthMetricKey,
  HealthSummary,
  isHealthAvailable,
} from '@/services/health';
import { colors3, metricColors, radius3, spacing3, typography3 } from '@/constants/theme';

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

/**
 * Abaixo de 1000: numero cheio (ex: "488"). A partir de 1000: abreviado em
 * milhares com 1 casa decimal (ex: 19488 -> "19,4K") — reduz a quantidade
 * de digitos exibidos (Passos e Calorias sao os 2 valores deste grid que
 * podem realmente passar de 4-5 digitos; FC nunca passa de 3).
 */
function formatCompactNumber(value: number): string {
  const rounded = Math.round(value);
  if (rounded < 1000) return rounded.toLocaleString('pt-BR');
  return `${(rounded / 1000).toFixed(1).replace('.', ',')}K`;
}

interface Tile {
  key: HealthMetricKey;
  color: string;
  label: string;
  value: string;
  /** Mesma linha do valor (ex: "bpm", "de 10k"), nao e dado adicional. */
  unit: string;
  progress: number | null; // 0-1, null = sem barra (sem dado)
}

/**
 * Faixa compacta de 4 metricas de saude da Home (sem card/titulo por
 * cima) — tema visual novo "prism-glass" (ver colors3 em
 * constants/theme.ts), cada tile e um GlassCard variant="card". Reaproveita
 * o MESMO servico ja usado pelo card de Apple Health da tela de Atividades
 * (services/healthkit.ts, fetchHealthSummary) — leitura nativa do
 * HealthKit, nao as tabelas smartwatch_data/heart_rate_samples do backend
 * (que existem mas nao sao escritas pelo app hoje; ver relatorio de
 * investigacao). So iOS tem HealthKit — Android nunca mostra este bloco,
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
      const available = await isHealthAvailable();
      if (!available) {
        setStatus('unavailable');
        return;
      }
      const authorized = await ensureHealthAuthorized();
      if (!authorized) {
        setStatus('disconnected');
        return;
      }
      await SecureStore.setItemAsync(HEALTHKIT_CONNECTED_KEY, 'true');
      setSummary(await fetchHealthSummary());
      setStatus('ready');
    } catch (err) {
      // DEBUG TEMPORARIO — mesmo motivo do catch em app/health/[metric].tsx:
      // ver se o resumo (fetchHealthSummary, consulta mais simples) tambem
      // falha, ou so o historico por periodo (fetchHealthMetricHistory) —
      // isola se e permissao (os 2 falhariam) ou algo especifico da consulta
      // de historico. Remover junto com o outro debug.
      console.error('[DEBUG HealthMetricsGrid] falha ao buscar resumo de saude:', err);
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
      color: metricColors.heartRate,
      label: 'Batim.',
      value: summary?.heartRate.mostRecentBpm != null ? `${summary.heartRate.mostRecentBpm}` : '--',
      unit: 'bpm',
      progress:
        summary?.heartRate.mostRecentBpm != null
          ? clamp01((summary.heartRate.mostRecentBpm - HR_RANGE.min) / (HR_RANGE.max - HR_RANGE.min))
          : null,
    },
    {
      key: 'steps',
      color: metricColors.steps,
      label: 'Passos',
      value: summary?.stepsToday != null ? formatCompactNumber(summary.stepsToday) : '--',
      unit: 'de 10k',
      progress: summary?.stepsToday != null ? clamp01(summary.stepsToday / STEPS_REFERENCE) : null,
    },
    {
      key: 'sleep',
      color: metricColors.sleep,
      label: 'Sono',
      value: summary?.sleepLastNightHours != null ? `${summary.sleepLastNightHours.toFixed(1)}h` : '--',
      unit: 'ontem',
      progress:
        summary?.sleepLastNightHours != null
          ? clamp01(summary.sleepLastNightHours / SLEEP_REFERENCE_HOURS)
          : null,
    },
    {
      key: 'calories',
      color: metricColors.energy,
      label: 'Calorias',
      value: summary?.activeEnergyTodayKcal != null ? formatCompactNumber(summary.activeEnergyTodayKcal) : '--',
      unit: 'kcal',
      progress:
        summary?.activeEnergyTodayKcal != null
          ? clamp01(summary.activeEnergyTodayKcal / ACTIVE_ENERGY_REFERENCE_KCAL)
          : null,
    },
  ];

  const showConnectHint = status === 'disconnected' || status === 'error' || status === 'checking';

  const renderTile = (tile: Tile) => (
    <Pressable
      key={tile.key}
      style={styles.tileWrap}
      onPress={() => router.push({ pathname: '/health/[metric]', params: { metric: tile.key } })}
    >
      <GlassCard variant="card" padding={spacing3.md} style={styles.tileCard}>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {tile.label}
        </Text>
        <View style={styles.tileValueRow}>
          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {tile.value}
          </Text>
          <Text style={styles.tileUnit} numberOfLines={1}>
            {' '}
            {tile.unit}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${(tile.progress ?? 0) * 100}%`, backgroundColor: tile.color }]}
          />
        </View>
      </GlassCard>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {/*
        Grade 2x2 (era 1 linha x 4 colunas) — estrutura inspirada no Garmin
        Connect (so o tamanho/proporcao dos cards, sem os aneis/graficos
        circulares dele, mantendo cores/tipografia colors3 do Tryv). 2
        Views de linha explicitas em vez de flexWrap: mais previsivel com
        `gap` do que confiar em porcentagem de largura quebrando sozinha.
      */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>{tiles.slice(0, 2).map(renderTile)}</View>
        <View style={styles.gridRow}>{tiles.slice(2, 4).map(renderTile)}</View>
      </View>

      {showConnectHint && (
        <Pressable style={styles.connectHint} onPress={() => router.push('/activity')} hitSlop={8}>
          <Text style={styles.connectHintText}>
            {status === 'error' ? 'Nao foi possivel carregar seus dados de saude.' : 'Nenhum dado sincronizado ainda.'}{' '}
            Conectar Apple Health
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const styles = StyleSheet.create({
  wrap: { gap: spacing3.xs },
  grid: { gap: spacing3.sm },
  gridRow: { flexDirection: 'row', gap: spacing3.sm },
  tileWrap: { flex: 1, minWidth: 0 },
  tileCard: { justifyContent: 'space-between' },
  tileLabel: { ...typography3.labelSm, color: colors3.onSurfaceVariant },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing3.md },
  // fontSize 18->32 — card 2x2 tem bem mais espaco que a faixa de 4
  // colunas de antes (que forcava um numero pequeno pra caber numa faixa
  // estreita); flexShrink:1 continua valendo, o adjustsFontSizeToFit ainda
  // reduz a fonte se algum numero grande demais nao couber numa linha so.
  tileValue: { ...typography3.headlineLg, fontSize: 32, lineHeight: 36, color: colors3.onSurface, flexShrink: 1 },
  // flexShrink:0 — nunca disputa espaco com tileValue, entao o texto
  // secundario (ex: "kcal", "ontem", "de 10k") sempre aparece inteiro, e e
  // o numero (tileValue) que cede espaco/encolhe fonte quando precisar.
  tileUnit: { ...typography3.labelSm, color: colors3.outline, flexShrink: 0 },
  progressTrack: {
    height: 3,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceVariant,
    overflow: 'hidden',
    marginTop: spacing3.md,
  },
  progressFill: { height: '100%', borderRadius: radius3.pill },

  connectHint: { paddingTop: spacing3.xs },
  connectHintText: {
    ...typography3.labelSm,
    color: colors3.primary,
    fontWeight: '700',
  },
});
