// Formata o "porque" de uma atualizacao da Vitalidade para a tela de depuracao (modo desenvolvedor). Logica PURA, testada no Node
// (mobile/tests/vitalityDebugView.test.mjs). Nada aqui sai do aparelho.
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
      title: 'Base da manhã',
      rows: [
        { label: 'Base usada', value: num(b.used) },
        { label: 'Base calculada agora', value: num(b.candidate) },
        { label: 'Congelada hoje', value: yesNo(b.frozen) },
        { label: 'Base final (com o sono de hoje)', value: yesNo(b.final) },
        { label: 'Provisória (antes de acordar)', value: yesNo(b.provisional) },
        { label: 'Sono ausente (usa 70 neutro)', value: yesNo(b.partialSleep) },
        { label: 'Qualidade do sono (0,65)', value: `${int(b.sleepQuality)}${b.sleepIsToday === false ? ' (noite de ontem)' : ''}` },
        { label: 'Confiança do sono', value: num(b.sleepQualityConfidence, 2) },
        { label: 'Componentes do sono', value: parts || '—' },
        { label: 'Carga 7 dias anteriores (0,20)', value: int(b.loadPrior) },
        { label: 'Carga com hoje (só backend)', value: int(b.loadWithToday) },
        { label: 'FC do backend (0,15)', value: int(b.hr) },
      ],
    },
    {
      title: 'Desgaste do dia',
      rows: [
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
        { label: 'Valor de ontem à noite', value: int(debug.yesterdayFinal) },
      ],
    },
    {
      title: 'Referências pessoais (14 dias)',
      rows: [
        { label: 'Passos típicos (fora de treino)', value: `${int(refs.steps)}${refs.fromHistory.steps ? '' : ' (padrão)'}` },
        { label: 'Calorias ativas típicas', value: `${int(refs.kcal)}${refs.fromHistory.kcal ? '' : ' (padrão)'}` },
        { label: 'Treino típico (unidades)', value: `${int(refs.eref)}${refs.fromHistory.eref ? '' : ' (padrão)'}` },
        { label: 'FC de repouso', value: int(debug.restHr) },
        { label: 'Fixadas hoje (guardadas)', value: yesNo(debug.refsFromStorage) },
      ],
    },
    {
      title: 'Hoje (ao vivo)',
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
        { label: 'Dia', value: debug.todayKey },
      ],
    },
  ];
}
