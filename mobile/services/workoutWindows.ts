// Treinos DUPLICADOS no Apple Saude (o mesmo treino gravado pelo relogio e copiado por outro app, como Strava ou Garmin): logica PURA, testada no Node
// (mobile/tests/workoutWindows.test.mjs). Sem isto, a duplicata dobraria as unidades de treino e o desconto de passos/calorias do movimento.

/** Sobreposicao minima (fracao da janela MAIS CURTA) para dois treinos contarem como o mesmo. 0,8 ou mais = duplicata. */
export const WORKOUT_DUPLICATE_OVERLAP = 0.8;

export interface TimeRange {
  /** Epoch em ms. */
  start: number;
  end: number;
}

/** Fracao (0 a 1) da janela mais curta coberta pela outra: intersecao / min(duracaoA, duracaoB). Janela invalida (duracao <= 0) = 0. */
export function overlapFraction(a: TimeRange, b: TimeRange): number {
  const durationA = a.end - a.start;
  const durationB = b.end - b.start;
  if (!(durationA > 0) || !(durationB > 0)) return 0;
  const intersection = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (!(intersection > 0)) return 0;
  return Math.min(1, intersection / Math.min(durationA, durationB));
}

/**
 * Junta treinos que sao o mesmo (sobreposicao >= 80% da janela mais curta) e fica com o de MAIOR duracao de cada grupo. Gulosa pela duracao: percorre do maior
 * para o menor e descarta o que se sobrepoe a 80% ou mais a um treino ja mantido; empate de duracao mantem o que comecou antes. Treino com janela invalida e
 * descartado. Devolve em ordem de inicio; nao altera a lista de entrada.
 */
export function mergeOverlappingWorkouts<T>(items: readonly T[], range: (item: T) => TimeRange, threshold: number = WORKOUT_DUPLICATE_OVERLAP): T[] {
  const valid = (items ?? [])
    .map((item, index) => ({ item, index, r: range(item) }))
    .filter(({ r }) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  const byDuration = valid.slice().sort((x, y) => y.r.end - y.r.start - (x.r.end - x.r.start) || x.r.start - y.r.start || x.index - y.index);
  const kept: typeof valid = [];
  for (const candidate of byDuration) {
    const duplicate = kept.some((k) => overlapFraction(candidate.r, k.r) >= threshold - 1e-9);
    if (!duplicate) kept.push(candidate);
  }
  return kept.sort((x, y) => x.r.start - y.r.start || x.index - y.index).map(({ item }) => item);
}
