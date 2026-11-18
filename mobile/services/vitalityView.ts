// Textos e formatos da Vitalidade que TODAS as telas compartilham (Home, aba Treino, Treinar, widget): logica PURA, testada no Node
// (mobile/tests/vitalityView.test.mjs, `npm test`). Rotulos de estado: os de VITALITY_LABELS (services/vitality.ts); limiares 65/40 em vitalityDynamic.ts.
import { VITALITY_LABELS } from '@/services/vitality';
import type { VitalityState } from '@/services/vitality';
import { isGarminSource } from '@/services/sleepNights';
import type { SleepFreshness } from '@/services/sleepNights';

/** Aviso curto que acompanha o numero da Vitalidade em toda tela. */
export const VITALITY_DISCLAIMER = 'Estimativa de bem-estar, não uma medida médica.';

/** Avisos quando o valor e ESTIMADO (faltam dados): sem sono recente (sem ancora de acordar, sem desgaste por tempo) ou sem leitura de passos/calorias agora. */
export const VITALITY_ESTIMATED_NOTE_NO_SLEEP = 'Estimado: sem dados de sono recentes.';
export const VITALITY_ESTIMATED_NOTE_NO_MOVEMENT = 'Estimado: sem leitura de passos e calorias agora.';
export const VITALITY_ESTIMATED_NOTE = 'Valor estimado: faltam dados recentes.';

/** Aviso de estimado conforme o motivo (sem_sono tem prioridade). Sem motivos = sem aviso. */
export function vitalityEstimatedNote(reasons: readonly string[] | null | undefined): string {
  if (!reasons || reasons.length === 0) return '';
  if (reasons.includes('sem_sono')) return VITALITY_ESTIMATED_NOTE_NO_SLEEP;
  if (reasons.includes('sem_movimento')) return VITALITY_ESTIMATED_NOTE_NO_MOVEMENT;
  return VITALITY_ESTIMATED_NOTE;
}

/**
 * Campos de Vitalidade que o WIDGET recebe: SEMPRE derivados do mesmo valor do app (rotulo e numero iguais ao "Em forma · 84" das telas). Sem valor ou sem dados = nulls.
 * Existe como funcao pura para o teste provar que widget e app nao divergem.
 */
export function widgetVitalityFields(
  vitality: { state: VitalityState; score: number | null } | null | undefined
): { vitalityLabel: string | null; vitalityScore: number | null } {
  if (!vitality || vitality.state === 'nodata' || typeof vitality.score !== 'number' || !Number.isFinite(vitality.score)) return { vitalityLabel: null, vitalityScore: null };
  return { vitalityLabel: VITALITY_LABELS[vitality.state], vitalityScore: Math.round(vitality.score) };
}

/** Frase de orientacao do estado (substitui o texto de prontidao do backend, que era calculado sem o esforco do dia). */
export function vitalityRecommendation(state: VitalityState): string {
  switch (state) {
    case 'fit':
      return 'Boa energia para treinar.';
    case 'attention':
      return 'Energia moderada: prefira um treino mais leve.';
    case 'recover':
      return 'Energia baixa: priorize descanso ou uma atividade leve.';
    default:
      return '';
  }
}

const part = (name: string, value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${name} ${Math.round(value)} de 100.` : `${name} sem dado.`;

/** Rotulo unico lido pelo leitor de tela: estado, pontuacao, componentes da base, provisorio e o aviso de estimativa. */
export function vitalityAccessibilityLabel(
  state: VitalityState,
  score: number | null | undefined,
  indicators: { sleep: number | null; load: number | null; hr: number | null } | null | undefined,
  estimated = false
): string {
  if (state === 'nodata' || typeof score !== 'number' || !Number.isFinite(score)) return 'Vitalidade: sem dados. Conecte o Apple Health.';
  const base = `${part('Sono', indicators?.sleep)} ${part('Carga', indicators?.load)} ${part('Frequência cardíaca', indicators?.hr)}`;
  return `Vitalidade: ${VITALITY_LABELS[state]}. Pontuação ${Math.round(score)} de 100. ${base}${estimated ? ` ${VITALITY_ESTIMATED_NOTE}` : ''} ${VITALITY_DISCLAIMER}`;
}

/** "Atualizado às HH:mm" (horario local); sem horario valido = vazio. */
export function formatUpdatedAt(epochMs: number | null | undefined): string {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return '';
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return '';
  return `Atualizado às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Texto "numero + rotulo" usado nas pilulas e no cabecalho: "Em forma · 84". Sem dados = so o rotulo de sem dados. */
export function vitalityHeadline(state: VitalityState, score: number | null | undefined): string {
  if (state === 'nodata' || typeof score !== 'number' || !Number.isFinite(score)) return VITALITY_LABELS.nodata;
  return `${VITALITY_LABELS[state]} · ${Math.round(score)}`;
}

/**
 * Rótulo de frescor do sono. Fresco: "Dados do Apple Saúde de hoje às 07:12". Velho (nenhum sono terminou hoje e já passou das 10h): "Último dado de sono: ontem às 11:54.
 * Abra o Garmin Connect para sincronizar." (cita o Garmin só se a fonte da última amostra é o Garmin; senão "o app do seu relógio"; mais antigo que ontem: "em dd/mm").
 * Desconhecido (sem amostra, ou cedo demais) = vazio.
 */
export function sleepFreshnessText(freshness: SleepFreshness, source?: string | null): string {
  if (freshness.kind === 'unknown') return '';
  const d = new Date(freshness.endedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (freshness.kind === 'fresh') return `Dados do Apple Saúde de hoje às ${clock}`;
  const when = freshness.daysAgo === 1 ? 'ontem' : `em ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const app = isGarminSource(source) ? 'o Garmin Connect' : 'o app do seu relógio';
  return `Último dado de sono: ${when} às ${clock}. Abra ${app} para sincronizar.`;
}
