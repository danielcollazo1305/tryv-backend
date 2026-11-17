// Textos e formatos da Vitalidade que TODAS as telas compartilham (Home, aba Treino, Treinar, widget): logica PURA, testada no Node
// (mobile/tests/vitalityView.test.mjs, `npm test`). Rotulos de estado: os de VITALITY_LABELS (services/vitality.ts); limiares 65/40 em vitalityDynamic.ts.
import { VITALITY_LABELS } from '@/services/vitality';
import type { VitalityState } from '@/services/vitality';

/** Aviso curto que acompanha o numero da Vitalidade em toda tela. */
export const VITALITY_DISCLAIMER = 'Estimativa de bem-estar, não uma medida médica.';

/** Aviso quando ainda nao ha o sono de hoje (o valor e o de ontem a noite). */
export const VITALITY_PROVISIONAL_NOTE = 'Valor provisório: atualiza quando você acordar.';

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
  provisional = false
): string {
  if (state === 'nodata' || typeof score !== 'number' || !Number.isFinite(score)) return 'Vitalidade: sem dados. Conecte o Apple Health.';
  const base = `${part('Sono', indicators?.sleep)} ${part('Carga', indicators?.load)} ${part('Frequência cardíaca', indicators?.hr)}`;
  return `Vitalidade: ${VITALITY_LABELS[state]}. Pontuação ${Math.round(score)} de 100. ${base}${provisional ? ` ${VITALITY_PROVISIONAL_NOTE}` : ''} ${VITALITY_DISCLAIMER}`;
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
