// Formata o "porque" de uma atualizacao da Vitalidade para a tela de depuracao (modo desenvolvedor). Logica PURA, testada no Node
// (mobile/tests/devMode.test.mjs). Nada aqui sai do aparelho.
import { HR_EFFORT_ENABLED, dynamicScoreToState } from '@/services/vitalityDynamic';
import type { VitalityDebug } from '@/services/vitalityEngine';
import type { SleepSessionInfo } from '@/services/sleepNights';
import { VITALITY_LABELS } from '@/services/vitality';
import { formatUpdatedAt } from '@/services/vitalityView';

export interface DebugSection {
  title: string;
  rows: { label: string; value: string }[];
}

const num = (v: number | null | undefined, digits = 1): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—');
const int = (v: number | null | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : '—');
const yesNo = (v: boolean | null | undefined): string => (v === null || v === undefined ? '—' : v ? 'sim' : 'não');
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "dd/mm HH:mm" em horario local de um instante ISO; invalido/ausente = "—". */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "9h 08m" a partir de minutos; ausente = "—". */
export function formatHoursMinutes(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return '—';
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)}h ${pad2(total % 60)}m`;
}

const SOURCE_LABELS: Record<string, string> = {
  sleep: 'noite lida agora',
  persisted: 'guardada (até 24 h)',
  none: 'nenhuma (estimado, sem sono)',
};
const REASON_LABELS: Record<string, string> = { sem_sono: 'sem sono', sem_movimento: 'sem passos/calorias' };

const PART_LABELS: Record<string, string> = {
  duration: 'duração',
  efficiency: 'eficiência',
  awakenings: 'despertares',
  debt: 'dívida de 7 dias',
  regularity: 'regularidade',
  stages: 'estágios',
};

/** Seções (titulo + linhas "rotulo: valor") com tudo o que entrou no calculo da Vitalidade desta atualizacao. */
export function formatVitalityDebug(debug: VitalityDebug): DebugSection[] {
  const b = debug.base;
  const c = debug.cycle;
  const r = debug.result;
  const refs = debug.refs;
  const day = debug.day;
  const parts = Object.entries(b.sleepParts ?? {})
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => `${PART_LABELS[key] ?? key} ${int(value as number)}`)
    .join(', ');
  const shownState = dynamicScoreToState(debug.shown);

  return [
    {
      title: 'Ciclo (começa ao acordar)',
      rows: [
        { label: 'Âncora (acordou em)', value: formatInstant(c.anchorAt) },
        { label: 'Origem da âncora', value: SOURCE_LABELS[c.anchorSource] ?? c.anchorSource },
        { label: 'Tempo acordado contado', value: formatHoursMinutes(c.awakeMinutes) },
        { label: 'Valor estimado', value: c.estimated ? `sim (${c.estimatedReasons.map((x) => REASON_LABELS[x] ?? x).join(', ')})` : 'não' },
        { label: 'Travado para não subir por falta de dado', value: c.cappedBy != null ? `sim (≤ ${num(c.cappedBy, 0)})` : 'não' },
      ],
    },
    {
      title: 'Base da manhã',
      rows: [
        { label: 'Base usada', value: num(b.used) },
        { label: 'Base calculada agora', value: num(b.candidate) },
        { label: 'Congelada neste ciclo', value: yesNo(b.frozen) },
        { label: 'Base final (com a noite da âncora)', value: yesNo(b.final) },
        { label: 'Sono ausente (usa 70 neutro)', value: yesNo(b.partialSleep) },
        { label: 'Qualidade do sono (0,65)', value: int(b.sleepQuality) },
        { label: 'Última noite lida acordou em', value: formatInstant(b.sleepWakeAt) },
        { label: 'Confiança do sono', value: num(b.sleepQualityConfidence, 2) },
        { label: 'Componentes do sono', value: parts || '—' },
        { label: 'Carga 7 dias anteriores (0,20)', value: int(b.loadPrior) },
        { label: 'Carga com hoje (só backend)', value: int(b.loadWithToday) },
        { label: 'FC do backend (0,15)', value: int(b.hr) },
      ],
    },
    {
      title: 'Desgaste do ciclo',
      rows: [
        { label: 'Tempo acordado (2,5/h, máx. 40)', value: r ? num(r.wear.time) : '—' },
        { label: 'Movimento (fora de treino)', value: r ? `${num(r.wear.movement)} (razão ${num(r.wear.movementRatio, 2)})` : '—' },
        { label: 'Treino', value: r ? `${num(r.wear.training)} (${num(r.wear.trainingUnits, 0)} unidades)` : '—' },
        { label: 'FC acima do repouso', value: r ? num(r.wear.heartRate) : '—' },
        { label: 'Desgaste total (máx. 55)', value: r ? num(r.wear.total) : '—' },
        { label: 'Recuperação', value: r ? num(r.recovery) : '—' },
      ],
    },
    {
      title: 'Resultado',
      rows: [
        { label: 'Valor calculado', value: num(debug.raw) },
        { label: 'Valor mostrado', value: int(debug.shown) },
        { label: 'Rótulo', value: VITALITY_LABELS[shownState] },
      ],
    },
    {
      title: 'Referências pessoais (14 dias)',
      rows: [
        { label: 'Passos típicos (fora de treino)', value: `${int(refs.steps)}${refs.fromHistory.steps ? '' : ' (padrão)'}` },
        { label: 'Calorias ativas típicas', value: `${int(refs.kcal)}${refs.fromHistory.kcal ? '' : ' (padrão)'}` },
        { label: 'Treino típico (unidades)', value: `${int(refs.eref)}${refs.fromHistory.eref ? '' : ' (padrão)'}` },
        { label: 'FC de repouso', value: int(debug.restHr) },
        { label: 'Fixadas neste ciclo (guardadas)', value: yesNo(debug.refsFromStorage) },
      ],
    },
    {
      title: 'Desde a âncora (ao vivo)',
      rows: [
        { label: 'Passos', value: int(day?.steps) },
        { label: 'Calorias ativas', value: int(day?.activeKcal) },
        { label: 'Treinos', value: String(day?.workouts.length ?? 0) },
        { label: 'FC média acordado acima do repouso', value: num(day?.awakeHrElevation) },
        { label: 'Horas de descanso', value: int(day?.restHours) },
        { label: 'Soneca (min)', value: int(day?.napMinutes) },
      ],
    },
    ...formatHrEffortDebug(debug),
    {
      title: 'Atualização',
      rows: [
        { label: 'Última atualização', value: formatUpdatedAt(debug.updatedAt) || '—' },
        { label: 'Dia do calendário', value: debug.todayKey },
      ],
    },
  ];
}

const KIND_LABELS: Record<SleepSessionInfo['kind'], string> = { night: 'noite', nap: 'soneca', partial: 'trecho parcial' };

/** Sessões de sono lidas (janela da tela de Sono), uma seção com uma linha por sessão: início → fim, fonte, valores e classificação. Sem sessões = linha avisando. */
export function formatSleepSessionsDebug(sessions: readonly SleepSessionInfo[]): DebugSection {
  const rows = sessions.map((s) => ({
    label: `${formatInstant(s.startAt)} → ${formatInstant(s.endAt)}`,
    value: `${KIND_LABELS[s.kind]} · dormiu ${formatHoursMinutes(s.asleepMin)} · ${s.hasStages ? 'com estágios' : 'sem estágios'} · valores ${s.values.join(',') || '—'} · ${s.sources.join(', ') || '—'}`,
  }));
  return { title: 'Sessões de sono lidas', rows: rows.length > 0 ? rows : [{ label: 'Sessões', value: 'nenhuma na janela lida' }] };
}

const HR_STATUS_LABELS: Record<string, string> = { treino: 'excluída (treino)', sono: 'excluída (sono/soneca)', sem_dado: 'sem amostra (conta 0)' };

/** Esforço por hora da FC (MODO SOMBRA): uma linha por hora cheia, totais e o desgaste de FC "atual" (o que vale) contra o "sombra" (esforço novo). Sem dado = seção avisando. */
export function formatHrEffortDebug(debug: VitalityDebug): DebugSection[] {
  const effort = debug.day?.hrEffort;
  const wear = debug.result?.wear;
  const mode = HR_EFFORT_ENABLED ? 'ligado (vale o esforço novo)' : 'desligado (modo sombra: vale o cálculo de antes)';
  const hourRows = (effort?.hours ?? []).map((h) => {
    const clock = formatInstant(new Date(h.startMs).toISOString());
    const value =
      h.status === 'ok' ? `FC ${int(h.avgHr)} · reserva ${num(h.reserve, 2)} · esforço ${num(h.effort)}` : `${HR_STATUS_LABELS[h.status] ?? h.status}${h.avgHr != null ? ` · FC ${int(h.avgHr)}` : ''}`;
    return { label: clock, value };
  });
  return [
    {
      title: 'FC: esforço por hora (sombra)',
      rows: [
        { label: 'Modo', value: mode },
        { label: 'Esforço do dia (soma das horas)', value: effort ? num(effort.total) : '—' },
        { label: 'Horas excluídas (treino / sono)', value: effort ? `${effort.excludedWorkout} / ${effort.excludedSleep}` : '—' },
        { label: 'Horas sem amostra', value: effort ? String(effort.noData) : '—' },
        { label: 'Desgaste de FC atual (elevação média)', value: wear ? num(wear.heartRateCurrent) : '—' },
        { label: 'Desgaste de FC sombra (esforço)', value: wear ? num(wear.heartRateShadow) : '—' },
        ...(hourRows.length > 0 ? hourRows : [{ label: 'Horas', value: 'nenhuma hora cheia no ciclo ainda' }]),
      ],
    },
  ];
}

export interface HeartRateSampleLite {
  startMs: number;
  endMs: number;
  bpm: number;
  sourceName: string | null;
  sourceId: string | null;
}

/** Percentil por interpolação linear (0-1) de uma lista ordenada. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Resolução real da FC de hoje: contagem, intervalo entre amostras consecutivas (mediana, p10, p90, em segundos), maior lacuna e as fontes. */
export function heartRateSampleStats(samples: readonly HeartRateSampleLite[]): {
  count: number;
  medianSec: number | null;
  p10Sec: number | null;
  p90Sec: number | null;
  maxGapSec: number | null;
  sources: { name: string; id: string; count: number }[];
} {
  const list = [...(samples ?? [])].sort((a, b) => a.startMs - b.startMs);
  const gaps: number[] = [];
  for (let i = 1; i < list.length; i++) gaps.push((list[i].startMs - list[i - 1].startMs) / 1000);
  const sorted = [...gaps].sort((a, b) => a - b);
  const bySource = new Map<string, { name: string; id: string; count: number }>();
  for (const s of list) {
    const key = `${s.sourceName ?? '?'}|${s.sourceId ?? '?'}`;
    const entry = bySource.get(key) ?? { name: s.sourceName ?? '?', id: s.sourceId ?? '?', count: 0 };
    entry.count += 1;
    bySource.set(key, entry);
  }
  const has = sorted.length > 0;
  return {
    count: list.length,
    medianSec: has ? percentile(sorted, 0.5) : null,
    p10Sec: has ? percentile(sorted, 0.1) : null,
    p90Sec: has ? percentile(sorted, 0.9) : null,
    maxGapSec: has ? sorted[sorted.length - 1] : null,
    sources: [...bySource.values()].sort((a, b) => b.count - a.count),
  };
}

const secs = (v: number | null): string => (v == null ? '—' : v >= 120 ? `${num(v / 60)} min` : `${num(v, 0)} s`);

/** Seção do botão "Ler FC de hoje". */
export function formatHeartRateStats(samples: readonly HeartRateSampleLite[]): DebugSection {
  const st = heartRateSampleStats(samples);
  if (st.count === 0) return { title: 'FC de hoje (amostras brutas)', rows: [{ label: 'Amostras', value: 'nenhuma desde 00:00' }] };
  return {
    title: 'FC de hoje (amostras brutas)',
    rows: [
      { label: 'Amostras desde 00:00', value: String(st.count) },
      { label: 'Intervalo mediano entre amostras', value: secs(st.medianSec) },
      { label: 'Intervalo p10 / p90', value: `${secs(st.p10Sec)} / ${secs(st.p90Sec)}` },
      { label: 'Maior lacuna', value: secs(st.maxGapSec) },
      ...st.sources.map((s, i) => ({ label: `Fonte ${i + 1}`, value: `${s.name} (${s.id}) · ${s.count}` })),
    ],
  };
}
