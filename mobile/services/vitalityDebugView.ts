// Formata o "porque" de uma atualizacao da Vitalidade para a tela de depuracao (modo desenvolvedor). Logica PURA, testada no Node
// (mobile/tests/devMode.test.mjs). Nada aqui sai do aparelho.
import { dynamicScoreToState } from '@/services/vitalityDynamic';
import type { VitalityDebug } from '@/services/vitalityEngine';
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
    {
      title: 'Atualização',
      rows: [
        { label: 'Última atualização', value: formatUpdatedAt(debug.updatedAt) || '—' },
        { label: 'Dia do calendário', value: debug.todayKey },
      ],
    },
  ];
}
