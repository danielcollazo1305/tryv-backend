// Regra PURA de "o app voltou ao primeiro plano": testada no Node (mobile/tests/appActive.test.mjs). O hook que usa isto e hooks/useOnAppActive.ts.

/** Pausa minima entre duas releituras da tela de Sono ao voltar ao app (curta: o dado do relogio pode ter chegado enquanto o app estava em segundo plano). */
export const SLEEP_REREAD_MIN_INTERVAL_MS = 10 * 1000;

/**
 * Deve rodar a acao? Só na TRANSICAO para 'active' (de 'background'/'inactive'), e se passou `minIntervalMs` desde a ultima execucao. Relogio andando para tras
 * (now < lastRunAt) conta como "passou" para nao travar para sempre.
 */
export function shouldRunOnActive(previous: string, next: string, lastRunAt: number, now: number, minIntervalMs: number): boolean {
  if (next !== 'active' || previous === 'active') return false;
  if (now < lastRunAt) return true;
  return now - lastRunAt >= minIntervalMs;
}
