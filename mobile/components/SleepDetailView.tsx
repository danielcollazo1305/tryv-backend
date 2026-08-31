import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { GlassCard } from '@/components/GlassCard';
import {
  ensureHealthAuthorized,
  fetchSleepSessionDetail,
  HEALTHKIT_CONNECTED_KEY,
  isHealthAvailable,
  SleepSessionDetail,
  SleepStage,
} from '@/services/health';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// Pesos de JetBrains Mono REALMENTE carregados (fontsToLoad2, app/_layout.tsx)
// sao so 600SemiBold e 700Bold — nao existe peso 500 carregado. Usar um
// nome de fonte nao carregado cai num fallback silencioso (mesma classe de
// bug ja diagnosticada antes nesta tela: numero "glitchado" por causa de
// mismatch de fonte/lineHeight) — MONO_MEDIUM aponta pro 600SemiBold (peso
// mais proximo de fato carregado), nao um "500Medium" inexistente.
const MONO_MEDIUM = 'JetBrainsMono_600SemiBold';
const MONO_BOLD = 'JetBrainsMono_700Bold';

type Status = 'checking' | 'unavailable' | 'disconnected' | 'empty' | 'ready' | 'error';

// So os 4 estagios reais mostrados no resumo (nao 'inBed', que e so um
// detalhe de fonte sem estagio — ver comentario em fetchSleepSessionDetail).
const SUMMARY_STAGES: SleepStage[] = ['deep', 'core', 'rem', 'awake'];

const STAGE_LABELS: Record<SleepStage, string> = {
  deep: 'Profundo',
  core: 'Leve',
  rem: 'REM',
  awake: 'Acordado',
  inBed: 'Na cama',
};

// Paleta do mockup aprovado (Tryv FC e Sono.dc.html): familia monocromatica
// indigo/roxo — Profundo mais escuro, REM mais claro, Acordado em cinza
// neutro pra nao competir visualmente com os estagios de sono de verdade.
// 'core' == metricColors.sleep (#818CF8); 'awake' == colors3.outlineVariant
// (mesmo hex #cbc3d7, coincidencia confirmada, reaproveitado como token).
const STAGE_COLORS: Record<SleepStage, string> = {
  deep: '#3730A3',
  core: '#818CF8',
  rem: '#C7D2FE',
  awake: colors3.outlineVariant,
  inBed: colors3.outline,
};

const PERIOD_OPTIONS = ['1D', '7D', '4 SEM', '1 ANO'] as const;

function formatDuration(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatTodayLabel(): string {
  const label = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  return `Noite de ${label.replace('.', '')}`;
}

function minutesForStage(breakdown: SleepSessionDetail['breakdown'], stage: SleepStage): number {
  switch (stage) {
    case 'deep':
      return breakdown.deepMinutes;
    case 'core':
      return breakdown.lightMinutes;
    case 'rem':
      return breakdown.remMinutes;
    case 'awake':
      return breakdown.awakeMinutes;
    default:
      return 0;
  }
}

/** Rotulos de hora ao longo da timeline — de hora em hora, cobrindo [startedAt, endedAt]. */
function buildHourTicks(startedAt: string, endedAt: string): string[] {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const ticks: string[] = [];
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  if (cursor < start) cursor.setHours(cursor.getHours() + 1);
  while (cursor <= end) {
    ticks.push(`${String(cursor.getHours()).padStart(2, '0')}h`);
    cursor.setHours(cursor.getHours() + 1);
  }
  return ticks;
}

interface SelectedSegment {
  stage: SleepStage;
  range: string;
  duration: string;
}

/**
 * Detalhe completo da ultima noite de sono — reconstruido do zero seguindo
 * o mockup aprovado (Tryv FC e Sono.dc.html, "Sono · Visao noite"), tema
 * "prism-glass" claro (colors3/GlassCard, mesmo sistema de Passos/Calorias
 * e da Home — migracao pedida explicitamente nesta tarefa, Sono deixa de
 * ser a unica tela ainda no tema escuro).
 *
 * TODA a logica de dado e reaproveitada de services/healthkit.ts
 * (fetchSleepSessionDetail) — nenhum numero novo calculado aqui, so
 * apresentacao. Sem card de "Body Battery" (nao e recurso real do Tryv,
 * omitido por completo, nem placeholder).
 *
 * Seletor de periodo/navegacao "< >" do mockup: presente visualmente (pra
 * bater com a hierarquia identica de Passos/Calorias/FC), mas SO "1D" e
 * funcional — nao existe (ainda) busca de noites anteriores nem breakdown
 * agregado por semana/mes pra sono (fetchSleepSessionDetail so cobre "a
 * ultima noite"). Os outros pills e as setas de navegacao ficam
 * desabilitados de proposito, em vez de fingir uma troca de dado que nao
 * existe (ver relatorio desta tarefa).
 */
export function SleepDetailView() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState<SleepSessionDetail | null>(null);
  const [selected, setSelected] = useState<SelectedSegment | null>(null);

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
      const result = await fetchSleepSessionDetail();
      if (!result) {
        setStatus('empty');
        return;
      }
      setDetail(result);
      setStatus('ready');
    } catch (err) {
      console.error('[SleepDetailView] falha ao buscar detalhe de sono:', err);
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (status === 'checking') {
    return <ActivityIndicator color={colors3.primary} style={styles.loading} />;
  }

  if (status === 'unavailable') {
    return <Text style={styles.emptyText}>Historico de saude disponivel so no iPhone, via Apple Health.</Text>;
  }

  if (status === 'disconnected') {
    return (
      <Pressable style={styles.connectHint} onPress={() => router.push('/activity')} hitSlop={8}>
        <Text style={styles.connectHintText}>Nenhum dado sincronizado ainda. Conectar Apple Health</Text>
        <Ionicons name="chevron-forward" size={14} color={colors3.primary} />
      </Pressable>
    );
  }

  if (status === 'error') {
    return <Text style={styles.error}>Nao foi possivel carregar o sono.</Text>;
  }

  if (status === 'empty' || !detail) {
    return <Text style={styles.emptyText}>Nenhum registro de sono na ultima noite.</Text>;
  }

  const totalForBars = detail.breakdown.totalAsleepMinutes + detail.breakdown.awakeMinutes;
  const inBedMinutes = (new Date(detail.endedAt).getTime() - new Date(detail.startedAt).getTime()) / (1000 * 60);
  const hourTicks = buildHourTicks(detail.startedAt, detail.endedAt);
  const hasRespiratoryRate = detail.respiratoryRate.average != null;

  return (
    <View style={styles.container}>
      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((label) => {
          const selectedPill = label === '1D';
          return (
            <View key={label} style={[styles.periodPill, selectedPill && styles.periodPillSelected]}>
              <Text
                style={[
                  styles.periodPillText,
                  selectedPill && styles.periodPillTextSelected,
                  !selectedPill && styles.periodPillTextDisabled,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Ionicons name="chevron-back" size={20} color={colors3.outlineVariant} />
        <Text style={styles.navLabel}>{formatTodayLabel()}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors3.outlineVariant} />
      </View>

      <GlassCard variant="glass" style={styles.card}>
        <Text style={styles.eyebrow}>Sono total</Text>
        <Text style={styles.totalValue}>{formatDuration(detail.breakdown.totalAsleepMinutes)}</Text>
        <Text style={styles.rangeText}>
          {formatTime(detail.startedAt)} — {formatTime(detail.endedAt)} · {formatDuration(inBedMinutes)} na cama
        </Text>

        <View style={styles.stagesList}>
          {SUMMARY_STAGES.map((stage) => {
            const minutes = minutesForStage(detail.breakdown, stage);
            const pct = totalForBars > 0 ? Math.round((minutes / totalForBars) * 100) : 0;
            return (
              <View key={stage} style={styles.stageBlock}>
                <View style={styles.stageHeaderRow}>
                  <View style={[styles.stageDot, { backgroundColor: STAGE_COLORS[stage] }]} />
                  <Text style={styles.stageLabel}>{STAGE_LABELS[stage]}</Text>
                  <Text style={styles.stageDuration}>{formatDuration(minutes)}</Text>
                  <Text style={styles.stagePct}>{pct}%</Text>
                </View>
                <View style={styles.stageBarTrack}>
                  <View
                    style={[
                      styles.stageBarFill,
                      { width: `${Math.max(pct, minutes > 0 ? 4 : 0)}%`, backgroundColor: STAGE_COLORS[stage] },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </GlassCard>

      <GlassCard variant="glass" style={styles.card}>
        <View style={styles.timelineHeaderRow}>
          <Text style={styles.eyebrow}>Linha do tempo</Text>
          <Text style={styles.timelineTotalText}>{formatDuration(inBedMinutes)}</Text>
        </View>
        <View style={styles.timelineTrack}>
          {detail.segments.map((segment, index) => {
            const minutes =
              (new Date(segment.endDate).getTime() - new Date(segment.startDate).getTime()) / (1000 * 60);
            const isAwake = segment.stage === 'awake';
            return (
              <Pressable
                key={`${segment.startDate}-${index}`}
                style={[
                  styles.timelineSegment,
                  isAwake ? styles.timelineSegmentAwake : styles.timelineSegmentFull,
                  { flex: Math.max(minutes, 1), backgroundColor: STAGE_COLORS[segment.stage] },
                ]}
                onPress={() =>
                  setSelected({
                    stage: segment.stage,
                    range: `${formatTime(segment.startDate)}–${formatTime(segment.endDate)}`,
                    duration: formatDuration(minutes),
                  })
                }
              />
            );
          })}
        </View>
        <View style={styles.timelineLabelsRow}>
          {hourTicks.map((tick, index) => (
            <Text key={`${tick}-${index}`} style={styles.timelineLabelText}>
              {tick}
            </Text>
          ))}
        </View>

        {!!selected && (
          <View style={styles.selectedPill}>
            <View style={[styles.stageDot, { backgroundColor: STAGE_COLORS[selected.stage] }]} />
            <Text style={styles.selectedStageText}>{STAGE_LABELS[selected.stage]}</Text>
            <Text style={styles.selectedRangeText}>
              {selected.range} · {selected.duration}
            </Text>
          </View>
        )}
      </GlassCard>

      <View style={styles.metricsRow}>
        <GlassCard variant="card" style={styles.metricCard}>
          <View style={styles.metricIconRow}>
            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(251, 113, 133, 0.14)' }]}>
              <Ionicons name="heart" size={12} color="#e5495f" />
            </View>
            <Text style={styles.metricEyebrow}>FC no sono</Text>
          </View>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{detail.heartRate.average ?? '--'}</Text>
            <Text style={styles.metricUnit}>bpm</Text>
          </View>
          <Text style={styles.metricSubtext}>
            {detail.heartRate.lowest != null && detail.heartRate.average != null
              ? `Mín. ${detail.heartRate.lowest} · méd. ${detail.heartRate.average}`
              : 'Sem amostra de FC nessa janela'}
          </Text>
        </GlassCard>

        <GlassCard variant="card" style={[styles.metricCard, !hasRespiratoryRate && styles.metricCardEmpty]}>
          <View style={styles.metricIconRow}>
            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(129, 140, 248, 0.16)' }]}>
              <Ionicons name="pulse" size={12} color="#4f46b8" />
            </View>
            <Text style={styles.metricEyebrow}>Respiração</Text>
          </View>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValue, !hasRespiratoryRate && styles.metricValueEmpty]}>
              {hasRespiratoryRate ? detail.respiratoryRate.average : '--'}
            </Text>
            {hasRespiratoryRate && <Text style={styles.metricUnit}>rpm</Text>}
          </View>
          <Text style={styles.metricSubtext}>
            {hasRespiratoryRate
              ? detail.respiratoryRate.lowest != null
                ? `Mais baixa: ${detail.respiratoryRate.lowest} rpm`
                : ' '
              : 'Sem dado de respiração nessa noite'}
          </Text>
        </GlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: spacing3.lg },
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

  container: { gap: spacing3.md },

  periodRow: { flexDirection: 'row', gap: spacing3.xs },
  periodPill: {
    flex: 1,
    paddingVertical: spacing3.sm - 2,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    alignItems: 'center',
  },
  periodPillSelected: { backgroundColor: colors3.primary, borderColor: colors3.primary },
  periodPillText: { ...typography3.labelSm, fontSize: 11 },
  periodPillTextSelected: { color: colors3.white, fontWeight: '700' },
  periodPillTextDisabled: { color: colors3.outlineVariant },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navLabel: { ...typography3.bodyMd, fontWeight: '600', textAlign: 'center', flex: 1, color: colors3.onSurface },

  card: { gap: spacing3.sm },
  eyebrow: {
    ...typography3.labelSm,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors3.onSurfaceVariant,
  },
  totalValue: {
    fontFamily: MONO_BOLD,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -2.2,
    color: colors3.onSurface,
  },
  rangeText: { fontFamily: MONO_MEDIUM, fontSize: 12, color: colors3.onSurfaceVariant, marginBottom: spacing3.sm },

  stagesList: { gap: spacing3.md, marginTop: spacing3.xs },
  stageBlock: { gap: 6 },
  stageHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing3.sm },
  stageDot: { width: 8, height: 8, borderRadius: 3 },
  stageLabel: { ...typography3.bodyMd, fontSize: 12, fontWeight: '600', flex: 1, color: colors3.onSurface },
  stageDuration: { fontFamily: MONO_BOLD, fontSize: 12, color: colors3.onSurface },
  stagePct: {
    fontFamily: MONO_MEDIUM,
    fontSize: 10,
    color: colors3.onSurfaceVariant,
    minWidth: 30,
    textAlign: 'right',
  },
  stageBarTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors3.surfaceContainerHigh,
    overflow: 'hidden',
  },
  stageBarFill: { height: '100%', borderRadius: 4, minWidth: 5 },

  timelineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  timelineTotalText: { ...typography3.bodyMd, fontSize: 12, fontWeight: '600', color: colors3.onSurfaceVariant },
  timelineTrack: {
    flexDirection: 'row',
    height: 54,
    borderRadius: radius3.md,
    backgroundColor: colors3.surfaceContainerHigh,
    gap: 1.5,
    padding: 0,
  },
  timelineSegment: { borderRadius: 2, minWidth: 3 },
  timelineSegmentFull: { height: '100%' },
  timelineSegmentAwake: { height: 13, alignSelf: 'flex-start' },
  timelineLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing3.xs },
  timelineLabelText: { fontFamily: MONO_MEDIUM, fontSize: 9, color: colors3.onSurfaceVariant },

  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    marginTop: spacing3.sm,
    paddingHorizontal: spacing3.sm + 2,
    paddingVertical: spacing3.sm - 1,
    borderRadius: radius3.md,
    backgroundColor: 'rgba(107, 56, 212, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(107, 56, 212, 0.16)',
  },
  selectedStageText: { ...typography3.bodyMd, fontSize: 12, fontWeight: '600', flex: 1, color: colors3.onSurface },
  selectedRangeText: { fontFamily: MONO_MEDIUM, fontSize: 11, color: colors3.onSurfaceVariant },

  metricsRow: { flexDirection: 'row', gap: spacing3.sm },
  metricCard: { flex: 1, gap: spacing3.sm },
  // GlassCard nao expoe a propria borda do wrapper via `style` (so o
  // conteudo interno) — dashed border real, como no mockup, exigiria
  // mexer no componente compartilhado (fora do escopo desta tarefa). O
  // estado vazio fica sinalizado so pelo valor "--" apagado + texto
  // explicativo (metricValueEmpty/metricSubtext abaixo).
  metricCardEmpty: {},
  metricIconRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metricIconWrap: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  metricEyebrow: {
    fontFamily: MONO_MEDIUM,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors3.onSurfaceVariant,
  },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  metricValue: { fontFamily: MONO_BOLD, fontSize: 30, lineHeight: 32, letterSpacing: -1.4, color: colors3.onSurface },
  metricValueEmpty: { color: colors3.outlineVariant },
  metricUnit: { fontFamily: MONO_MEDIUM, fontSize: 11, color: colors3.onSurfaceVariant },
  metricSubtext: { ...typography3.bodyMd, fontSize: 11, color: colors3.onSurfaceVariant },
});
