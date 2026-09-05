import { ActivityType, RoutePoint } from '@/services/activities';

/**
 * Tipos compartilhados do hub de saude do app, agnosticos de plataforma —
 * extraidos de healthkit.ts (implementacao iOS) pra que uma futura
 * implementacao Android (Health Connect) possa devolver exatamente o mesmo
 * formato de dado, sem duplicar as interfaces. Ver services/health.ts (a
 * fachada publica que os consumidores devem importar).
 */

export interface HealthKitWorkout {
  id: string;
  activityType: ActivityType;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  distanceMeters: number | null;
  caloriesBurned: number | null;
  /** Presente so quando o treino tem uma rota de GPS (HKWorkoutRoute) associada. */
  routePoints: RoutePoint[] | null;
  /**
   * So Android/Health Connect: true quando o treino provavelmente TEM rota
   * GPS mas ela nao pode ser lida (falta a permissao "Rotas de exercicio" /
   * READ_EXERCISE_ROUTES, que nao da pra pedir via requestPermission nesta
   * lib). No iOS fica sempre undefined (HKWorkoutRoute nao precisa de
   * permissao a parte). A tela de importacao usa isto pra avisar o usuario.
   */
  routeUnavailable?: boolean;
}

export interface HealthSummary {
  stepsToday: number | null;
  steps7d: number | null;
  distanceTodayMeters: number | null;
  distance7dMeters: number | null;
  activeEnergyTodayKcal: number | null;
  activeEnergy7dKcal: number | null;
  heartRate: {
    mostRecentBpm: number | null;
    mostRecentAt: string | null;
    average7dBpm: number | null;
  };
  /** Soma dos intervalos "dormindo" (exclui "na cama" e "acordado") nas ultimas ~32h. */
  sleepLastNightHours: number | null;
}

export interface HeartRateSamplePoint {
  bpm: number;
  recordedAt: string;
}

/** HealthKit nao tem estagio "leve" separado de "core" — Core JA E o sono leve (Deep/REM sao os outros 2 estagios reais monitorados). inBed listado a parte pra timeline (nao entra nos minutos por estagio, ver fetchSleepSessionDetail). */
export type SleepStage = 'deep' | 'core' | 'rem' | 'awake' | 'inBed';

export interface SleepStageSegment {
  stage: SleepStage;
  /** ISO, sempre dentro da janela da ultima noite. */
  startDate: string;
  endDate: string;
}

export interface SleepStageBreakdown {
  deepMinutes: number;
  /** Soma de amostras 'core' (rotulado "Leve" na UI) + 'asleepUnspecified' (fonte que nao diferencia estagio — tratada como generica/leve, nao descartada). */
  lightMinutes: number;
  remMinutes: number;
  awakeMinutes: number;
  /** deep + light + rem (nao inclui awake nem inBed). */
  totalAsleepMinutes: number;
}

export interface SleepSessionDetail {
  /** 'YYYY-MM-DD' do dia em que a pessoa ACORDOU — mesmo criterio ja usado em fetchSleepHistoryBuckets. */
  date: string;
  /** ISO do inicio/fim da sessao (primeiro/ultimo segmento da noite) — usados tambem como janela pra buscar FC/respiracao "durante o sono". */
  startedAt: string;
  endedAt: string;
  breakdown: SleepStageBreakdown;
  /** Ordenados cronologicamente — pra timeline visual (barra empilhada horizontal). */
  segments: SleepStageSegment[];
  /** HKQuantityTypeIdentifierHeartRate na janela [startedAt, endedAt] — null se nao houver amostra (ex: sem Apple Watch durante o sono). Mesmo formato de `respiratoryRate` abaixo (media + mais baixa, nao so 1 numero). */
  heartRate: { average: number | null; lowest: number | null };
  /** A partir de HKQuantityTypeIdentifierRespiratoryRate na mesma janela — precisa da permissao nova (ver HEALTHKIT_READ_TYPES). */
  respiratoryRate: { average: number | null; lowest: number | null };
}

export interface DailyQuantityPoint {
  /** 'YYYY-MM-DD' em horario local. */
  date: string;
  /** null = sem dado nesse dia (HealthKit nao distingue "zero" de "sem amostra" na resposta agregada). */
  value: number | null;
}

export type HealthHistoryPeriod = '1d' | '7d' | '4w' | '1y';
export type HealthHistoryGranularity = 'day' | 'month';
export type HealthMetricKey = 'heartRate' | 'steps' | 'sleep' | 'calories';

export interface HealthHistoryPoint {
  /** 'YYYY-MM-DD' (granularity='day') ou 'YYYY-MM' (granularity='month'), sempre local. */
  date: string;
  value: number | null;
}

export interface HealthMetricHistory {
  period: HealthHistoryPeriod;
  granularity: HealthHistoryGranularity;
  offset: number;
  startDate: string;
  endDate: string;
  points: HealthHistoryPoint[];
  /** Media so sobre os pontos com dado (null nao entra), igual a avg_calories etc. de MealsSummary. */
  average: number | null;
}

export interface HeartRateIntradayPoint {
  /** ISO — inicio do bucket de 10min. */
  time: string;
  bpm: number;
}

export interface DayHeartRateDetail {
  /** 'YYYY-MM-DD' local. */
  date: string;
  /** Buckets de 10min (nao amostra crua — ver investigacao: controla volume de dado de forma previsivel). */
  points: HeartRateIntradayPoint[];
  /** HKQuantityTypeIdentifierRestingHeartRate do dia (calculado pela Apple) — null se nao houver. */
  restingBpm: number | null;
  /** discreteMax das amostras de HeartRate do dia — nao existe tipo "pico" calculado pela Apple. */
  peakBpm: number | null;
}

export interface WeekHeartRateDayPoint {
  date: string;
  restingBpm: number | null;
  peakBpm: number | null;
}

export interface WeekHeartRateDetail {
  days: WeekHeartRateDayPoint[];
  /** Media dos 'restingBpm' diarios existentes na semana — "Méd. repouso". */
  avgRestingBpm: number | null;
  /** Media dos 'peakBpm' diarios existentes na semana — "Média-Alto". */
  avgPeakBpm: number | null;
}
