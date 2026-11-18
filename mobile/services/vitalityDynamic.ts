// Vitalidade DINAMICA: funcoes PURAS (sem React Native, sem HealthKit, sem rede), testadas direto no Node (mobile/tests/vitalityDynamic.test.mjs,
// `npm test`). Ainda NAO ligada a nenhuma tela, ao widget nem ao backend (Rodada B). E uma ESTIMATIVA de bem-estar, nao medida medica nem diagnostico.
//
// Ideia ("nivel de energia"): o dia comeca na BASE DA MANHA (sono, carga de 7 dias, FC de repouso), DESCE com o esforco de hoje e se recupera um
// pouco com descanso. Nunca passa da base, nunca cai mais que MAX_DROP no dia, sempre fica entre 0 e 100.
//
//   base     B = 0,65·sono + 0,20·carga + 0,15·FC   (sono ausente = 70 neutro, base marcada como parcial; carga/FC ausentes: peso redistribuido)
//   desgaste D = min(MAX_DROP, tempo acordado + movimento + treino + FC do dia)
//     tempo     = min(40, 2,5 · horas_acordado),  horas_acordado = horas desde a ANCORA (quando acordou) menos o cochilo (ver TIME_WEAR) — o CICLO nao reinicia a meia-noite
//     movimento = 32·(1 − e^(−0,4·M)),  M = media de (passos/ref_passos) e (kcal ativas/ref_kcal)  — SO passos e calorias FORA dos treinos
//     treino    = 24·(1 − e^(−E/(2·Eref))),  E = Σ minutos·(0,5 + 1,5·intensidade) — o treino pesa SO aqui (nunca tambem no movimento)
//     FC do dia = 6·clamp(elevacao_media_acordado/25, 0, 1)
//   recuperacao R = min(8, 0,35·(D sem o tempo), 0,8·horas_de_descanso + min(5, 2,5·min_de_soneca/30))   — descanso recupera o ESFORCO; so sono/soneca recuperam o tempo acordado
//   Vitalidade V = clamp(B − (D − R)·(0,6 + 0,4·B/100),  max(0, B − MAX_DROP),  B)
//
// Referencia PESSOAL: mediana dos ultimos 14 dias do proprio usuario, calculada com a MESMA regra do movimento (sem os treinos de cada dia);
// sem >= 5 dias com dado, usa o fallback (FALLBACK_REFERENCES). Limiares do estado: 65 / 40 o dia todo (VITALITY_DYNAMIC_THRESHOLDS).
import type { VitalityState } from '@/services/vitality';

// ----------------------------------------------------------------------------------------------------------------------------- constantes
export const K = {
  /** Desgaste maximo do movimento, e a rapidez com que satura. */
  moveMax: 32,
  moveK: 0.4,
  /** Desgaste maximo do treino. */
  workMax: 24,
  /** Desgaste maximo da FC acima do repouso (acordado, fora de treino). */
  hrMax: 6,
  /** Queda maxima da Vitalidade num dia, em pontos. */
  maxDrop: 55,
  /** Recuperacao: pontos por hora de descanso, por 30 min de soneca (com teto proprio), teto total e fracao maxima do desgaste. */
  restPoints: 0.8,
  napPoints30: 2.5,
  napCap: 5,
  recoveryMax: 8,
  recoveryFraction: 0.35,
} as const;

/**
 * DESGASTE POR TEMPO ACORDADO (um unico lugar para ajustar). O ciclo comeca quando a pessoa ACORDA (ancora) e a Vitalidade desce de forma continua com as horas.
 *  - ratePerHour 2,5: 16 h acordado = 40 pontos (o teto); um dia comum de 12 h acordado gasta 30. Calibrado para que quem acordou as 12 h e esta sentado a meia-noite fique
 *    na faixa de 55 a 60 (rotulo moderado).
 *  - cap 40: teto POR CICLO; passa de 16 h acordado o tempo nao gasta mais (o esforco, que e outro termo, continua).
 *  - napSleepNotAwake 1: os minutos dormidos na soneca NAO sao tempo acordado (a pessoa estava dormindo): saem inteiros da conta.
 *  - napRestorativeCredit 0,5: alem disso, cada minuto de soneca abate mais 0,5 minuto acordado (sono curto devolve alerta, mas menos que uma noite: por isso metade). Uma
 *    soneca de 30 min abate 45 min de tempo acordado (~1,9 ponto) e ainda soma a recuperacao de descanso (K.napPoints30).
 */
export const TIME_WEAR = {
  ratePerHour: 2.5,
  cap: 40,
  napSleepNotAwake: 1,
  napRestorativeCredit: 0.5,
} as const;

export const BASE_WEIGHTS = { sleep: 0.65, load: 0.2, hr: 0.15 } as const;
/** Sono ausente entra como este valor neutro (nao some), e a base fica marcada como parcial. */
export const SLEEP_NEUTRAL = 70;

/** Sem historico suficiente (< MIN_HISTORY_DAYS dias com dado) a referencia e esta (passos e calorias FORA de treino; Eref em unidades de treino). */
export const FALLBACK_REFERENCES = { steps: 6000, kcal: 300, eref: 60 } as const;
export const MIN_HISTORY_DAYS = 5;
export const MIN_WORKOUT_DAYS = 3;
export const HISTORY_DAYS = 14;
export const REF_LIMITS = { steps: [3000, 14000], kcal: [150, 1200], eref: [40, 120] } as const;

/** FC maxima usada quando nao se sabe a da pessoa (a intensidade do treino e relativa a ela). */
export const DEFAULT_MAX_HR = 190;

// ----------------------------------------------------------------------------------------------------------- esforco por hora da FC (MODO SOMBRA)
/**
 * Interruptor do esforco por hora da FC. false (padrao) = a Vitalidade usa EXATAMENTE o desgaste de FC de antes (heartRateWear, FC media acordado acima do repouso); o esforco novo
 * e calculado e aparece so no diagnostico (modo desenvolvedor). true so em teste, ate calibrar com dados reais do iPhone.
 */
export const HR_EFFORT_ENABLED = false;

/**
 * TRIMP de Banister (1991), por hora: esforco = minutos x reserva x A x e^(B x reserva), com reserva = (FC da hora - FC de repouso) / (FC maxima - FC de repouso), limitada a [0, 1].
 * A e B (0,64 e 1,92) sao os valores classicos para homens; o peso exponencial faz a hora intensa valer bem mais que varias horas leves. fullUnits = esforco do dia que gasta o teto
 * (K.hrMax, 6 pontos): PROVISORIO, sem calibracao com dados reais.
 */
export const HR_EFFORT = { weightA: 0.64, weightB: 1.92, fullUnits: 150, hourMinutes: 60 } as const;

/** FC maxima de Tanaka (2001): 208 - 0,7 x idade. */
export const TANAKA_MAX_HR = { base: 208, perYear: 0.7 } as const;
/** Idade fora desta faixa (data de nascimento errada) = usa a FC maxima padrao. */
export const MAX_HR_AGE_RANGE = [10, 100] as const;

/**
 * FC maxima pela idade (Tanaka). Data de nascimento ausente, mal formada, no futuro ou com idade fora de 10-100 anos = DEFAULT_MAX_HR. So alimenta o esforco por hora; os treinos
 * (workoutUnits) continuam com DEFAULT_MAX_HR para nao mudar o resultado atual.
 */
export function maxHrFromAge(dateOfBirth: string | null | undefined, now: Date = new Date()): number {
  const m = typeof dateOfBirth === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth) : null;
  if (!m) return DEFAULT_MAX_HR;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return DEFAULT_MAX_HR;
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  if (!(age >= MAX_HR_AGE_RANGE[0] && age <= MAX_HR_AGE_RANGE[1])) return DEFAULT_MAX_HR;
  return Math.round(TANAKA_MAX_HR.base - TANAKA_MAX_HR.perYear * age);
}

export interface Interval {
  startMs: number;
  endMs: number;
}

/** Uma hora cheia do ciclo com a FC media dela (null = nenhuma amostra de FC nessa hora). */
export interface HrHourInput {
  startMs: number;
  avgHr: number | null;
}

export type HrHourStatus = 'ok' | 'treino' | 'sono' | 'sem_dado';

export interface HrHourEffort {
  startMs: number;
  avgHr: number | null;
  /** ok = contou; treino/sono = hora excluida (treino ja entra em workoutUnits; sono/soneca nao e esforco); sem_dado = sem FC (ou sem repouso) = 0. */
  status: HrHourStatus;
  /** 0-1; null quando a hora nao contou. */
  reserve: number | null;
  effort: number;
}

export interface HourlyEffortResult {
  hours: HrHourEffort[];
  /** Soma do esforco das horas que contaram. */
  total: number;
  excludedWorkout: number;
  excludedSleep: number;
  noData: number;
}

const overlaps = (list: readonly Interval[] | undefined, a: number, b: number): boolean => (list ?? []).some((x) => x.startMs < b && x.endMs > a);

/**
 * Esforco por hora desde a ancora (TRIMP de Banister, ver HR_EFFORT). Cada hora cheia: se toca um treino ou um sono/soneca, e EXCLUIDA (treino ja conta em workoutUnits); sem FC na hora
 * (ou sem FC de repouso, ou FC maxima abaixo do repouso) = 0; senao reserva = clamp((FC - repouso)/(max - repouso), 0, 1) e esforco = 60 x reserva x 0,64 x e^(1,92 x reserva). FC abaixo
 * do repouso = reserva 0 = esforco 0. Dado ausente nunca soma. `maxHr` invalido usa DEFAULT_MAX_HR.
 */
export function hourlyEffort(
  hours: readonly HrHourInput[],
  restHr: number | null | undefined,
  maxHr: number | null | undefined,
  exclusions: { workouts?: readonly Interval[]; sleep?: readonly Interval[] }
): HourlyEffortResult {
  const max = isNum(maxHr) && maxHr > 0 ? maxHr : DEFAULT_MAX_HR;
  const out: HourlyEffortResult = { hours: [], total: 0, excludedWorkout: 0, excludedSleep: 0, noData: 0 };
  for (const h of hours ?? []) {
    const end = h.startMs + HR_EFFORT.hourMinutes * 60000;
    let status: HrHourStatus = 'ok';
    let reserve: number | null = null;
    let effort = 0;
    if (overlaps(exclusions?.workouts, h.startMs, end)) {
      status = 'treino';
      out.excludedWorkout += 1;
    } else if (overlaps(exclusions?.sleep, h.startMs, end)) {
      status = 'sono';
      out.excludedSleep += 1;
    } else if (!isNum(h.avgHr) || !isNum(restHr) || max <= restHr) {
      status = 'sem_dado';
      out.noData += 1;
    } else {
      reserve = clamp((h.avgHr - restHr) / (max - restHr), 0, 1);
      effort = HR_EFFORT.hourMinutes * reserve * HR_EFFORT.weightA * Math.exp(HR_EFFORT.weightB * reserve);
      out.total += effort;
    }
    out.hours.push({ startMs: h.startMs, avgHr: isNum(h.avgHr) ? h.avgHr : null, status, reserve, effort });
  }
  return out;
}

/** Desgaste de FC pelo esforco do dia: cresce ate K.hrMax (o MESMO teto do desgaste atual, 6 pontos) com HR_EFFORT.fullUnits. Ausente/negativo = 0. */
export function hrEffortWear(effortTotal: number | null | undefined): number {
  if (!isNum(effortTotal) || effortTotal <= 0) return 0;
  return K.hrMax * clamp(effortTotal / HR_EFFORT.fullUnits, 0, 1);
}
/** Calorias ativas atribuidas a um treino que nao informa a propria energia: minutos x este valor (esforco moderado). */
export const WORKOUT_KCAL_PER_MIN_FALLBACK = 7;

/** Estado exibido: Em forma >= 65, Atencao >= 40, Recuperar abaixo (os mesmos rotulos de VITALITY_LABELS). */
export const VITALITY_DYNAMIC_THRESHOLDS = { fit: 65, attention: 40 } as const;

/** Suavizacao entre atualizacoes do mesmo dia: ignora variacao menor que 1 ponto, cai ate 12 e sobe ate 2 por atualizacao. */
export const SMOOTHING = { hysteresis: 1, maxDown: 12, maxUp: 2 } as const;

// ----------------------------------------------------------------------------------------------------------------------------------- tipos
export interface WorkoutInput {
  /** Duracao em minutos. */
  minutes: number;
  /** FC media do treino (bpm); ausente = intensidade desconhecida (peso 1,0). */
  avgHr?: number | null;
  /** Calorias ativas do treino; ausente = estimativa por minutos (WORKOUT_KCAL_PER_MIN_FALLBACK). */
  activeKcal?: number | null;
  /** Passos dados DURANTE o treino (so contam se informados; sem informar, nada e descontado dos passos do dia). */
  steps?: number | null;
}

export interface DayInput {
  /** Totais do dia ate agora (cumulativos). null = sem dado. */
  steps: number | null;
  activeKcal: number | null;
  /** Treinos concluidos hoje. */
  workouts: readonly WorkoutInput[];
  /** FC media acordado, FORA de treino, acima da FC de repouso (bpm); ausente = sem FC. */
  awakeHrElevation?: number | null;
  /** Horas acordado e em descanso (poucos passos e FC perto do repouso) e minutos de soneca. */
  restHours?: number;
  napMinutes?: number;
  /** Minutos ACORDADO contados desde a ancora (ja sem o cochilo, ver awakeMinutesSince); null/ausente = sem ancora = sem desgaste por tempo. */
  awakeMinutes?: number | null;
  /** Esforco por hora da FC (MODO SOMBRA, ver HR_EFFORT_ENABLED): so diagnostico enquanto o interruptor estiver desligado. */
  hrEffort?: HourlyEffortResult | null;
}

export interface PersonalReferences {
  /** Passos e calorias ativas tipicos de um dia, FORA de treino. */
  steps: number;
  kcal: number;
  /** Unidades de treino de uma sessao tipica. */
  eref: number;
  /** De onde veio cada valor: false = fallback (historico insuficiente). */
  fromHistory: { steps: boolean; kcal: boolean; eref: boolean };
}

export interface BaseInput {
  /** Qualidade do sono 0-100 (sleepQuality.ts); null = sem sono. */
  sleep: number | null | undefined;
  /** Pilares do backend (/readiness/today): carga (0-100) e FC (0-100); null = ausente. */
  load: number | null | undefined;
  hr: number | null | undefined;
}

export interface WearBreakdown {
  /** Desgaste pelo tempo acordado desde a ancora (0 sem ancora). */
  time: number;
  movement: number;
  training: number;
  heartRate: number;
  /** Diagnostico: desgaste de FC pelo calculo de antes (elevacao media) e pelo esforco por hora (sombra). heartRate e um dos dois, conforme HR_EFFORT_ENABLED. */
  heartRateCurrent: number;
  heartRateShadow: number;
  /** Soma limitada a K.maxDrop. */
  total: number;
  /** Medidas intermediarias, uteis para depurar: razao de movimento (1 = dia tipico) e unidades de treino. */
  movementRatio: number;
  trainingUnits: number;
}

export interface VitalityResult {
  score: number;
  wear: WearBreakdown;
  recovery: number;
}

// -------------------------------------------------------------------------------------------------------------------------------- utilitarios
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const nonNeg = (v: unknown): number => (isNum(v) && v > 0 ? v : 0);

/** Mediana; lista vazia = null. */
export function median(values: readonly number[]): number | null {
  const v = values.filter(isNum).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// -------------------------------------------------------------------------------------------------------------------------- treino e movimento
/**
 * Unidades de treino de UMA sessao: minutos x peso pela intensidade. Intensidade = (FC media − repouso) / (FC maxima − repouso), entre 0 e 1; peso =
 * 0,5 + 1,5·intensidade (0,5 a 2,0). Sem FC media, sem FC de repouso ou com FC maxima <= repouso: peso 1,0 (intensidade desconhecida, nao zero).
 */
export function workoutUnits(workout: WorkoutInput, restHr: number | null | undefined, maxHr: number | null | undefined = DEFAULT_MAX_HR): number {
  const minutes = nonNeg(workout?.minutes);
  if (minutes === 0) return 0;
  const max = isNum(maxHr) && maxHr > 0 ? maxHr : DEFAULT_MAX_HR;
  if (!isNum(workout.avgHr) || !isNum(restHr) || max <= restHr) return minutes;
  const intensity = clamp((workout.avgHr - restHr) / (max - restHr), 0, 1);
  return minutes * (0.5 + 1.5 * intensity);
}

/** Calorias ativas atribuidas a um treino: as informadas, ou a estimativa por minutos. */
export function workoutKcal(workout: WorkoutInput): number {
  if (isNum(workout?.activeKcal) && workout.activeKcal >= 0) return workout.activeKcal;
  return nonNeg(workout?.minutes) * WORKOUT_KCAL_PER_MIN_FALLBACK;
}

/**
 * Passos e calorias do dia FORA dos treinos (contagem dupla evitada: o que pertence a um treino pesa so no termo de treino). Subtrai dos totais os
 * passos e calorias dos treinos (nunca abaixo de zero). Total ausente (null) continua ausente. Passos de treino nao informados nao sao descontados.
 */
export function nonWorkoutMovement(day: Pick<DayInput, 'steps' | 'activeKcal' | 'workouts'>): { steps: number | null; kcal: number | null } {
  const workouts = day?.workouts ?? [];
  const workoutSteps = workouts.reduce((sum, w) => sum + nonNeg(w?.steps), 0);
  const workoutEnergy = workouts.reduce((sum, w) => sum + workoutKcal(w), 0);
  return {
    steps: isNum(day?.steps) ? Math.max(0, day.steps - workoutSteps) : null,
    kcal: isNum(day?.activeKcal) ? Math.max(0, day.activeKcal - workoutEnergy) : null,
  };
}

/** Unidades de treino totais de um dia. */
export function dayTrainingUnits(workouts: readonly WorkoutInput[], restHr: number | null | undefined, maxHr?: number | null): number {
  return (workouts ?? []).reduce((sum, w) => sum + workoutUnits(w, restHr, maxHr), 0);
}

// ------------------------------------------------------------------------------------------------------------------------ referencia pessoal
/**
 * Referencia pessoal a partir dos ultimos 14 dias (sem hoje; a lista pode ter dias sem dado). Passos e calorias: mediana do movimento FORA de treino de
 * cada dia, so com >= 5 dias com dado, limitada a REF_LIMITS; Eref: mediana das unidades de treino dos dias COM treino, com >= 3 desses dias. Cada
 * valor sem historico suficiente usa o fallback.
 */
export function personalReferences(
  history: readonly Pick<DayInput, 'steps' | 'activeKcal' | 'workouts'>[],
  restHr: number | null | undefined,
  maxHr?: number | null
): PersonalReferences {
  const days = (history ?? []).slice(-HISTORY_DAYS);
  const moves = days.map((d) => nonWorkoutMovement(d));
  const steps = moves.map((m) => m.steps).filter(isNum);
  const kcal = moves.map((m) => m.kcal).filter(isNum);
  const units = days.map((d) => dayTrainingUnits(d?.workouts ?? [], restHr, maxHr)).filter((u) => u > 0);

  const stepsMedian = steps.length >= MIN_HISTORY_DAYS ? median(steps) : null;
  const kcalMedian = kcal.length >= MIN_HISTORY_DAYS ? median(kcal) : null;
  const unitsMedian = units.length >= MIN_WORKOUT_DAYS ? median(units) : null;
  return {
    steps: stepsMedian == null ? FALLBACK_REFERENCES.steps : clamp(stepsMedian, REF_LIMITS.steps[0], REF_LIMITS.steps[1]),
    kcal: kcalMedian == null ? FALLBACK_REFERENCES.kcal : clamp(kcalMedian, REF_LIMITS.kcal[0], REF_LIMITS.kcal[1]),
    eref: unitsMedian == null ? FALLBACK_REFERENCES.eref : clamp(unitsMedian, REF_LIMITS.eref[0], REF_LIMITS.eref[1]),
    fromHistory: { steps: stepsMedian != null, kcal: kcalMedian != null, eref: unitsMedian != null },
  };
}

// ----------------------------------------------------------------------------------------------------------------------------------- base
/**
 * Base da manha. Sono ausente entra como 70 neutro (partialSleep = true); carga e FC ausentes tem o peso redistribuido; sem NENHUM dado = null
 * (nada e inventado). Entradas fora de 0-100 sao limitadas.
 */
export function morningBase(input: BaseInput): { base: number | null; partialSleep: boolean } {
  const sleepMissing = !isNum(input?.sleep);
  const parts: [number, number][] = [];
  if (!sleepMissing) parts.push([BASE_WEIGHTS.sleep, clamp(input.sleep as number, 0, 100)]);
  if (isNum(input?.load)) parts.push([BASE_WEIGHTS.load, clamp(input.load, 0, 100)]);
  if (isNum(input?.hr)) parts.push([BASE_WEIGHTS.hr, clamp(input.hr, 0, 100)]);
  if (parts.length === 0) return { base: null, partialSleep: true };
  if (sleepMissing) parts.push([BASE_WEIGHTS.sleep, SLEEP_NEUTRAL]);
  const weight = parts.reduce((s, [w]) => s + w, 0);
  const base = parts.reduce((s, [w, v]) => s + w * v, 0) / weight;
  return { base: Math.round(base * 10) / 10, partialSleep: sleepMissing };
}

// --------------------------------------------------------------------------------------------------------------------------------- desgaste
/** Desgaste do movimento (fora de treino): 32·(1 − e^(−0,4·M)); M = media das razoes disponiveis (passos e calorias) sobre a referencia pessoal. */
export function movementWear(day: Pick<DayInput, 'steps' | 'activeKcal' | 'workouts'>, refs: Pick<PersonalReferences, 'steps' | 'kcal'>): { wear: number; ratio: number } {
  const { steps, kcal } = nonWorkoutMovement(day);
  const ratios: number[] = [];
  if (steps != null && refs.steps > 0) ratios.push(steps / refs.steps);
  if (kcal != null && refs.kcal > 0) ratios.push(kcal / refs.kcal);
  const ratio = ratios.length === 0 ? 0 : ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return { wear: K.moveMax * (1 - Math.exp(-K.moveK * ratio)), ratio };
}

/** Desgaste do treino: 24·(1 − e^(−E/(2·Eref))). Eref invalido (<= 0) usa o fallback. */
export function trainingWear(units: number, eref: number): number {
  const ref = isNum(eref) && eref > 0 ? eref : FALLBACK_REFERENCES.eref;
  return K.workMax * (1 - Math.exp(-nonNeg(units) / (2 * ref)));
}

/** Desgaste pela FC acima do repouso (acordado, fora de treino): ate 6 pontos, cheio com 25 bpm acima. Ausente/negativo = 0. */
export function heartRateWear(awakeHrElevation: number | null | undefined): number {
  if (!isNum(awakeHrElevation) || awakeHrElevation <= 0) return 0;
  return K.hrMax * clamp(awakeHrElevation / 25, 0, 1);
}

/**
 * Minutos ACORDADO do ciclo: tempo desde a ancora (quando acordou) menos o cochilo (minutos dormidos + credito restaurador, ver TIME_WEAR). Ancora no futuro ou ausente = 0.
 * `anchorMs`/`nowMs` em epoch ms.
 */
export function awakeMinutesSince(anchorMs: number | null | undefined, nowMs: number, napMinutes: number | null | undefined): number {
  if (!isNum(anchorMs) || !isNum(nowMs)) return 0;
  const elapsed = Math.max(0, nowMs - anchorMs) / 60000;
  const nap = nonNeg(napMinutes) * (TIME_WEAR.napSleepNotAwake + TIME_WEAR.napRestorativeCredit);
  return Math.max(0, elapsed - nap);
}

/** Desgaste pelo tempo acordado: 2,5 pontos por hora, ate 40 por ciclo. Sem minutos (null/ausente/negativo) = 0: sem ancora NAO se inventa desgaste por tempo. */
export function timeWear(awakeMinutes: number | null | undefined): number {
  if (!isNum(awakeMinutes) || awakeMinutes <= 0) return 0;
  return Math.min(TIME_WEAR.cap, (TIME_WEAR.ratePerHour * awakeMinutes) / 60);
}

/** Desgaste total do ciclo (monotonico: so cresce com o tempo, passos, calorias, treino e FC) com cada parcela e o teto K.maxDrop. */
export function dayWear(day: DayInput, refs: PersonalReferences, restHr: number | null | undefined, maxHr?: number | null, options?: { hrEffortEnabled?: boolean }): WearBreakdown {
  const movement = movementWear(day, refs);
  const trainingUnits = dayTrainingUnits(day?.workouts ?? [], restHr, maxHr);
  const training = trainingWear(trainingUnits, refs.eref);
  const heartRateCurrent = heartRateWear(day?.awakeHrElevation);
  const heartRateShadow = hrEffortWear(day?.hrEffort?.total);
  // Modo sombra: so usa o esforco novo se o interruptor estiver ligado E ele existir; senao, exatamente o de antes.
  const heartRate = (options?.hrEffortEnabled ?? HR_EFFORT_ENABLED) && day?.hrEffort ? heartRateShadow : heartRateCurrent;
  const time = timeWear(day?.awakeMinutes);
  return {
    time,
    movement: movement.wear,
    training,
    heartRate,
    heartRateCurrent,
    heartRateShadow,
    total: Math.min(time + movement.wear + training + heartRate, K.maxDrop),
    movementRatio: movement.ratio,
    trainingUnits,
  };
}

// ----------------------------------------------------------------------------------------------------------------------------- recuperacao
/**
 * Recuperacao: descanso e soneca devolvem pontos, com teto (8, e no maximo 35% do desgaste FISICO: nada recupera o que nao foi gasto). `physicalWear` = movimento + treino + FC,
 * SEM o desgaste por tempo (ficar sentado nao "recupera" horas acordado; so dormir/cochilar faz isso, pelo abatimento do tempo).
 */
export function recoveryPoints(day: Pick<DayInput, 'restHours' | 'napMinutes'>, physicalWear: number): number {
  const rest = Math.floor(nonNeg(day?.restHours)) * K.restPoints;
  const nap = Math.min(K.napCap, (nonNeg(day?.napMinutes) / 30) * K.napPoints30);
  return Math.max(0, Math.min(rest + nap, K.recoveryMax, K.recoveryFraction * Math.max(0, physicalWear)));
}

// -------------------------------------------------------------------------------------------------------------------------------- resultado
/** V = clamp(B − (D − R)·(0,6 + 0,4·B/100), max(0, B − 55), B). Base fora de 0-100 e limitada. Nunca passa da base nem de 0-100. */
export function applyWear(base: number, totalWear: number, recovery: number): number {
  const b = clamp(base, 0, 100);
  const factor = 0.6 + 0.4 * (b / 100);
  const raw = b - Math.max(0, totalWear - recovery) * factor;
  return clamp(raw, Math.max(0, b - K.maxDrop), b);
}

/** Vitalidade de agora (valor bruto, sem suavizar) a partir da base da manha e dos totais de hoje. */
export function vitalityNow(base: number, day: DayInput, refs: PersonalReferences, restHr: number | null | undefined, maxHr?: number | null, options?: { hrEffortEnabled?: boolean }): VitalityResult {
  const wear = dayWear(day, refs, restHr, maxHr, options);
  const recovery = recoveryPoints(day, wear.movement + wear.training + wear.heartRate);
  return { score: applyWear(base, wear.total, recovery), wear, recovery };
}

/** Estado exibido pelo valor: Em forma >= 65, Atencao >= 40, Recuperar abaixo; valor ausente/NaN = sem dados. */
export function dynamicScoreToState(score: number | null | undefined): VitalityState {
  if (!isNum(score)) return 'nodata';
  const s = clamp(score, 0, 100);
  if (s >= VITALITY_DYNAMIC_THRESHOLDS.fit) return 'fit';
  if (s >= VITALITY_DYNAMIC_THRESHOLDS.attention) return 'attention';
  return 'recover';
}

// ------------------------------------------------------------------------------------------------------------------------------ estabilidade
/**
 * Suaviza entre duas atualizacoes do MESMO dia: variacao menor que 1 ponto mantem o valor mostrado (sem tremer), a queda e limitada a 12 pontos e a
 * subida a 2 por atualizacao. Sem valor anterior mostra o novo. Sempre inteiro entre 0 e 100.
 */
export function smoothVitality(previous: number | null | undefined, next: number): number {
  const target = clamp(next, 0, 100);
  if (!isNum(previous)) return Math.round(target);
  const prev = clamp(previous, 0, 100);
  const delta = target - prev;
  if (Math.abs(delta) < SMOOTHING.hysteresis) return Math.round(prev);
  return Math.round(clamp(prev + clamp(delta, -SMOOTHING.maxDown, SMOOTHING.maxUp), 0, 100));
}

/**
 * Uma leitura do HealthKit que falha ou chega atrasada nao pode "recuperar" a Vitalidade: totais do dia so crescem. Combina a leitura nova com a
 * anterior pegando o MAIOR de cada total cumulativo (passos, calorias, descanso, soneca) e a lista de treinos mais longa.
 */
export function monotonicDay(previous: DayInput | null | undefined, next: DayInput): DayInput {
  if (!previous) return next;
  const maxOrNull = (a: number | null, b: number | null): number | null => (isNum(a) && isNum(b) ? Math.max(a, b) : isNum(a) ? a : isNum(b) ? b : null);
  return {
    ...next,
    steps: maxOrNull(previous.steps, next.steps),
    activeKcal: maxOrNull(previous.activeKcal, next.activeKcal),
    workouts: (next.workouts?.length ?? 0) >= (previous.workouts?.length ?? 0) ? next.workouts : previous.workouts,
    restHours: Math.max(nonNeg(previous.restHours), nonNeg(next.restHours)),
    napMinutes: Math.max(nonNeg(previous.napMinutes), nonNeg(next.napMinutes)),
    // Esforco da FC so cresce (leitura que falha nao o zera): fica o de maior total.
    hrEffort: (next.hrEffort?.total ?? -1) >= (previous.hrEffort?.total ?? -1) ? next.hrEffort : previous.hrEffort,
  };
}

// ------------------------------------------------------------------------------------------------------------------------------ base do dia
export interface FrozenBase {
  /** Dia local (YYYY-MM-DD) a que a base pertence. */
  dayKey: string;
  base: number;
}

/**
 * Base da manha CONGELADA no app: o primeiro calculo FINAL do dia (com o sono de hoje) vale o dia inteiro, mesmo que o backend a recalcule (a carga
 * muda com os treinos de hoje). Uma base provisoria (sono de ontem, antes de acordar) nunca e congelada. Devolve a base a usar, se e provisoria e o
 * que persistir (null = nada novo para gravar).
 */
export function freezeMorningBase(
  stored: FrozenBase | null | undefined,
  todayKey: string,
  candidate: { base: number | null; final: boolean }
): { base: number | null; provisional: boolean; persist: FrozenBase | null } {
  if (stored && stored.dayKey === todayKey && isNum(stored.base)) return { base: stored.base, provisional: false, persist: null };
  if (isNum(candidate?.base)) {
    if (candidate.final) return { base: candidate.base, provisional: false, persist: { dayKey: todayKey, base: candidate.base } };
    return { base: candidate.base, provisional: true, persist: null };
  }
  return { base: null, provisional: false, persist: null };
}

// ----------------------------------------------------------------------------------------------------------------------------- o que mostrar
export interface DisplayInput {
  /** Base do dia (congelada ou provisoria) ou null se nao ha. */
  base: number | null;
  /** true = base provisoria (sono de ontem; hoje a pessoa ainda nao acordou ou nao sincronizou). */
  provisional: boolean;
  /** Totais de hoje (null = sem leitura ainda). */
  day: DayInput | null;
  refs: PersonalReferences;
  restHr: number | null;
  maxHr?: number | null;
  /** Ultimo valor MOSTRADO e se foi calculado hoje (so suaviza dentro do mesmo dia). */
  previousShown: number | null;
  previousShownIsToday: boolean;
  /** Ultimo valor MOSTRADO ontem a noite (mostrado, provisoriamente, ate hoje haver sono). */
  yesterdayFinal: number | null;
}

export interface DisplayResult {
  /** null = sem dados (nunca mostra numero inventado). */
  score: number | null;
  state: VitalityState;
  /** true = ainda nao ha o sono de hoje: o valor e o de ontem (ou a base provisoria), e a tela deve avisar. */
  provisional: boolean;
  result: VitalityResult | null;
}

/** Decide o valor exibido, juntando base, totais de hoje, suavizacao e os casos "antes de acordar" e "sem dados". */
export function displayedVitality(input: DisplayInput): DisplayResult {
  const nodata: DisplayResult = { score: null, state: 'nodata', provisional: false, result: null };
  if (input.base == null || !isNum(input.base)) {
    if (isNum(input.yesterdayFinal)) {
      const score = Math.round(clamp(input.yesterdayFinal, 0, 100));
      return { score, state: dynamicScoreToState(score), provisional: true, result: null };
    }
    return nodata;
  }
  if (input.provisional) {
    const fallback = isNum(input.yesterdayFinal) ? input.yesterdayFinal : input.base;
    const score = Math.round(clamp(fallback, 0, 100));
    return { score, state: dynamicScoreToState(score), provisional: true, result: null };
  }
  const day: DayInput = input.day ?? { steps: null, activeKcal: null, workouts: [] };
  const result = vitalityNow(input.base, day, input.refs, input.restHr, input.maxHr);
  const score = smoothVitality(input.previousShownIsToday ? input.previousShown : null, result.score);
  return { score, state: dynamicScoreToState(score), provisional: false, result };
}
