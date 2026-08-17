import { RegisterDraft } from '@/context/RegisterDraftContext';

/**
 * Numero total de passos do wizard de cadastro — 7 quando o usuario
 * informou uma meta especifica no passo Objetivo (o passo final de
 * Estimativa de tempo entra), 6 quando nao (passo pulado). Nos passos 1
 * e 2 (Conta/Corpo), a meta especifica ainda nao foi perguntada, entao
 * o total mostrado ali e sempre 6 — se o usuario definir uma meta no
 * passo 3, o "de X" salta de 6 pra 7 a partir dali. Pequena imprecisao
 * visual conhecida de wizard condicional, documentada em vez de
 * escondida ou "consertada" com um total fixo que mentiria pro outro caso.
 */
export function getOnboardingTotalSteps(draft: Pick<RegisterDraft, 'targetBodyFatPercentage' | 'targetWeight'>): number {
  const hasTarget = !!draft.targetBodyFatPercentage.trim() || !!draft.targetWeight.trim();
  return hasTarget ? 7 : 6;
}
