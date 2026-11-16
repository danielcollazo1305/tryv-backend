// Qualidade do sono (0-100): logica PURA (sem React Native, sem HealthKit e sem imports), testada direto no Node (mobile/tests/sleepQuality.test.mjs,
// `npm test`). E uma ESTIMATIVA de bem-estar calculada no aparelho a partir do que o Apple Saude registrou; nao e medida medica nem diagnostico.
//
// Componentes (cada um de 0 a 100) e pesos quando TODOS existem; componente sem dado e retirado e os pesos restantes sao renormalizados:
//   duracao 0,35 · eficiencia 0,12 · despertares 0,08 · divida de 7 dias 0,15 · regularidade 0,10 · estagios (profundo e REM) 0,20
// Sem a DURACAO da noite nao ha qualidade (null): nada se estima sem saber quanto a pessoa dormiu.

/** Necessidade de sono padrao, em horas (a pessoa podera escolher a sua no futuro). */
export const SLEEP_NEED_HOURS_DEFAULT = 8;

export type SleepQualityComponent = 'duration' | 'efficiency' | 'awakenings' | 'debt' | 'regularity' | 'stages';

export const SLEEP_QUALITY_WEIGHTS: Record<SleepQualityComponent, number> = {
  duration: 0.35,
  efficiency: 0.12,
  awakenings: 0.08,
  debt: 0.15,
  regularity: 0.1,
  stages: 0.2,
};

/** Minimo de noites no historico para calcular divida e regularidade (menos que isso = componente ausente, nao "ruim"). */
export const SLEEP_HISTORY_MIN_NIGHTS = 4;
/** Quantas noites (a mais recente e a que esta sendo avaliada) entram na divida e na regularidade. */
export const SLEEP_HISTORY_NIGHTS = 7;

export interface SleepNightInput {
  /** Minutos dormidos (obrigatorio; <= 0, NaN ou ausente = sem duracao = sem qualidade). */
  asleepMin: number | null | undefined;
  /** Minutos "na cama" (so se a fonte registra); ausente = sem eficiencia. */
  inBedMin?: number | null;
  /** Minutos acordado DEPOIS de pegar no sono; so quando a fonte registra estagios (0 e um valor valido); ausente = sem despertares. */
  awakeAfterOnsetMin?: number | null;
  /** Minutos de sono profundo e de REM; so quando a fonte registra estagios (ambos ou nenhum). */
  deepMin?: number | null;
  remMin?: number | null;
  /** Ponto medio do sono em minutos desde a meia-noite LOCAL (0-1439); ausente = sem regularidade. */
  midpointMin?: number | null;
}

export interface SleepQualityResult {
  /** 0-100, inteiro; null quando nao ha duracao da noite. */
  quality: number | null;
  /** Soma dos pesos dos componentes usados (0-1): 1 = todos os dados existiam; so a duracao = 0,35. */
  confidence: number;
  /** Nota de cada componente usado (0-100, sem arredondar). */
  parts: Partial<Record<SleepQualityComponent, number>>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const NO_RESULT: SleepQualityResult = { quality: null, confidence: 0, parts: {} };

/** Duracao vs necessidade: r = dormido/necessidade. Ate 1: 100·r^1,6 (7 h de 8 = 81; 6 h = 63; 4 h = 33); de 1 a 1,25: 100; acima disso perde 80 pontos por unidade de r, sem passar de 70. */
export function durationScore(asleepMin: number, needHours: number = SLEEP_NEED_HOURS_DEFAULT): number {
  const need = isNum(needHours) && needHours > 0 ? needHours : SLEEP_NEED_HOURS_DEFAULT;
  const r = asleepMin / (need * 60);
  if (r <= 0) return 0;
  if (r <= 1) return 100 * Math.pow(r, 1.6);
  if (r <= 1.25) return 100;
  return clamp(100 - (r - 1.25) * 80, 70, 100);
}

/** Eficiencia = dormido/na cama (limitada a 1): 92% ou mais = 100; 75% ou menos = 0; linear entre os dois. */
export function efficiencyScore(asleepMin: number, inBedMin: number): number {
  const eff = Math.min(1, asleepMin / inBedMin);
  return clamp((eff - 0.75) / (0.92 - 0.75), 0, 1) * 100;
}

/** Despertares: 100 sem tempo acordado; perde 1,2 ponto por minuto acordado depois de dormir (30 min = 64; 84 min ou mais = 0). */
export function awakeningsScore(awakeAfterOnsetMin: number): number {
  return clamp(100 - Math.max(0, awakeAfterOnsetMin) * 1.2, 0, 100);
}

/** Divida de sono das noites dadas: soma de max(0, necessidade - dormido) em horas. */
export function sleepDebtHours(asleepMinList: readonly number[], needHours: number = SLEEP_NEED_HOURS_DEFAULT): number {
  return asleepMinList.reduce((sum, m) => sum + Math.max(0, needHours - m / 60), 0);
}

/** Divida: 100 sem divida; perde 12,5 pontos por hora de divida na semana (2 h = 75; 8 h ou mais = 0). */
export function debtScore(debtHours: number): number {
  return clamp(100 - Math.max(0, debtHours) * 12.5, 0, 100);
}

/**
 * Desvio-padrao CIRCULAR, em minutos, dos pontos medios do sono (minutos desde a meia-noite). Circular porque 23:50 e 00:10 estao a 20 minutos um do
 * outro, e um desvio comum os veria a quase 24 h. Um so ponto (ou todos iguais) = 0.
 */
export function circularStdMinutes(minutesOfDay: readonly number[]): number {
  if (minutesOfDay.length < 2) return 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const m of minutesOfDay) {
    const angle = (2 * Math.PI * m) / 1440;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  const resultant = Math.hypot(sumSin, sumCos) / minutesOfDay.length;
  if (resultant >= 1 - 1e-12) return 0;
  if (resultant <= 1e-9) return 1440 / 2; // pontos espalhados em volta do relogio: desvio maximo
  return (Math.sqrt(-2 * Math.log(resultant)) * 1440) / (2 * Math.PI);
}

/** Regularidade: 100 com desvio ate 20 min; perde 0,8 ponto por minuto acima disso (60 min = 68; 145 min ou mais = 0). */
export function regularityScore(stdMinutes: number): number {
  return clamp(100 - Math.max(0, stdMinutes - 20) * 0.8, 0, 100);
}

/** Estagios: profundo >= 15% do sono = 100 e REM >= 20% = 100 (proporcionais abaixo disso); a nota e a media dos dois. */
export function stagesScore(deepMin: number, remMin: number, asleepMin: number): number {
  const deep = clamp(deepMin / asleepMin / 0.15, 0, 1) * 100;
  const rem = clamp(remMin / asleepMin / 0.2, 0, 1) * 100;
  return 0.5 * deep + 0.5 * rem;
}

/**
 * Qualidade da noite MAIS RECENTE da lista (ordem cronologica, da mais antiga para a mais nova; a ultima e a que esta sendo avaliada e entra na
 * divida e na regularidade junto com as anteriores; so as ultimas SLEEP_HISTORY_NIGHTS contam).
 * Retorna quality = null sem duracao valida (ultima noite sem minutos dormidos). Dado invalido de um componente (NaN, negativo, fora do possivel)
 * retira SO esse componente, nunca vira zero nem derruba o resto.
 */
export function computeSleepQuality(
  nights: readonly SleepNightInput[],
  needHours: number = SLEEP_NEED_HOURS_DEFAULT
): SleepQualityResult {
  if (!nights || nights.length === 0) return NO_RESULT;
  const night = nights[nights.length - 1];
  if (!night || !isNum(night.asleepMin) || night.asleepMin <= 0) return NO_RESULT;
  const asleep = night.asleepMin;

  const parts: Partial<Record<SleepQualityComponent, number>> = {};
  parts.duration = durationScore(asleep, needHours);

  if (isNum(night.inBedMin) && night.inBedMin > 0) parts.efficiency = efficiencyScore(asleep, night.inBedMin);
  if (isNum(night.awakeAfterOnsetMin) && night.awakeAfterOnsetMin >= 0) parts.awakenings = awakeningsScore(night.awakeAfterOnsetMin);

  const window = nights.slice(-SLEEP_HISTORY_NIGHTS);
  const need = isNum(needHours) && needHours > 0 ? needHours : SLEEP_NEED_HOURS_DEFAULT;
  const validAsleep = window.map((n) => n?.asleepMin).filter((m): m is number => isNum(m) && m > 0);
  if (validAsleep.length >= SLEEP_HISTORY_MIN_NIGHTS) parts.debt = debtScore(sleepDebtHours(validAsleep, need));
  const midpoints = window.map((n) => n?.midpointMin).filter((m): m is number => isNum(m) && m >= 0 && m < 1440);
  if (midpoints.length >= SLEEP_HISTORY_MIN_NIGHTS) parts.regularity = regularityScore(circularStdMinutes(midpoints));

  if (isNum(night.deepMin) && isNum(night.remMin) && night.deepMin >= 0 && night.remMin >= 0 && night.deepMin + night.remMin <= asleep * 1.001) {
    parts.stages = stagesScore(night.deepMin, night.remMin, asleep);
  }

  let weightSum = 0;
  let weighted = 0;
  for (const key of Object.keys(parts) as SleepQualityComponent[]) {
    weightSum += SLEEP_QUALITY_WEIGHTS[key];
    weighted += SLEEP_QUALITY_WEIGHTS[key] * (parts[key] as number);
  }
  return {
    quality: Math.round(clamp(weighted / weightSum, 0, 100)),
    confidence: Math.round(weightSum * 1000) / 1000,
    parts,
  };
}
