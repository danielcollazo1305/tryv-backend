// Contagem de toques para ativar o MODO DESENVOLVEDOR (7 toques seguidos na linha de versao em Ajustes). Logica PURA, testada no Node (mobile/tests/devTaps.test.mjs).
// Fica escondido de quem nao sabe: sem dica na tela e sem feedback ate o ultimo toque.

export const DEV_TAPS_NEEDED = 7;
/** Pausa maxima entre dois toques; passou disso, a contagem recomeca. */
export const DEV_TAP_WINDOW_MS = 2000;

export interface TapState {
  count: number;
  /** Instante (ms) do ultimo toque contado. */
  last: number;
}

/** Registra um toque em `now` (ms). `triggered` = este toque completou a sequencia (e a contagem volta a zero). */
export function nextTap(
  previous: TapState | null | undefined,
  now: number,
  needed: number = DEV_TAPS_NEEDED,
  windowMs: number = DEV_TAP_WINDOW_MS
): { state: TapState; triggered: boolean } {
  const continuing = !!previous && previous.count > 0 && now >= previous.last && now - previous.last <= windowMs;
  const count = continuing ? previous!.count + 1 : 1;
  if (count >= needed) return { state: { count: 0, last: now }, triggered: true };
  return { state: { count, last: now }, triggered: false };
}
