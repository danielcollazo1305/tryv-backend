import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/services/api';

export interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: string;
  /** Metros acima do nivel do mar — usada pro "Ganho de elev." do card de progresso (Home). Ausente em pontos capturados antes dessa captura existir. */
  alt?: number | null;
}

export type GpsActivityType = 'run' | 'bike' | 'walk';
export type ManualActivityType = 'swim' | 'fight' | 'hiit' | 'other';
export type ActivityType = GpsActivityType | ManualActivityType;

export interface Run {
  id: string;
  user_id: string;
  activity_type: string;
  route_points: RoutePoint[];
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
  calories_burned: number | null;
  started_at: string;
  finished_at: string;
  /** Preenchidos so quando a corrida veio de importacao do hub de saude — null em tudo gravado dentro do app. */
  external_source: string | null;
  external_id: string | null;
}

export interface RunSplit {
  km: number;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
  /** true so no ultimo split quando a corrida nao fecha um km inteiro no final. */
  is_partial: boolean;
}

export interface RunDetail extends Run {
  heart_rate_avg: number | null;
  heart_rate_max: number | null;
  /** Soma so das subidas (dead-band de 1m contra ruido de GPS) — calculado sob demanda no backend a partir de route_points, ver run_calculator.py. */
  elevation_gain_meters: number;
  /** Splits por km calculados sob demanda a partir de route_points — [] se a corrida tiver menos de 2 pontos de rota. */
  splits: RunSplit[];
}

export interface RunCreateResult extends Run {
  /** Recordes pessoais batidos por essa corrida — sempre [] pra quem nao e Pro. */
  new_prs: string[];
}

export interface RunCreatePayload {
  // O backend aceita qualquer ACTIVITY_TYPES (nao so run/bike) — o app so
  // envia run/bike a partir do rastreamento manual, mas a importacao do
  // Apple Health pode enviar outros tipos quando ha rota de GPS disponivel
  // (ex: natacao em aguas abertas).
  activity_type: ActivityType;
  route_points: RoutePoint[];
  started_at: string;
  finished_at: string;
  /**
   * Identidade do treino na fonte externa quando veio de importacao do hub de
   * saude (ver services/workoutAutoImport.ts). Preenchidos, o POST vira
   * idempotente no backend: reimportar o mesmo treino devolve o registro ja
   * existente em vez de criar outro. Ausentes numa corrida rastreada pelo
   * proprio app.
   */
  external_source?: ExternalActivitySource;
  external_id?: string;
}

/** Hub de saude de onde um treino foi importado — bate com o valor gravado em runs.external_source/manual_activities.external_source no backend. */
export type ExternalActivitySource = 'apple_health' | 'health_connect';

export interface ManualActivity {
  id: string;
  user_id: string;
  activity_type: string;
  duration_minutes: number;
  calories_burned: number | null;
  notes: string | null;
  performed_at: string;
  /** Ver o mesmo par em Run. */
  external_source: string | null;
  external_id: string | null;
}

export interface ManualActivityCreatePayload {
  // Mesmo motivo do RunCreatePayload: a importacao do Apple Health pode
  // enviar um treino run/bike sem rota de GPS como registro manual.
  activity_type: ActivityType;
  duration_minutes: number;
  calories_burned?: number | null;
  notes?: string | null;
  performed_at: string;
  /** Ver o mesmo par em RunCreatePayload. */
  external_source?: ExternalActivitySource;
  external_id?: string;
}

export interface ActivityInsight {
  summary: string;
  highlight: string | null;
  suggestion: string;
}

export async function createRun(payload: RunCreatePayload): Promise<RunCreateResult> {
  const response = await api.post<RunCreateResult>('/runs/', payload);
  return response.data;
}

/**
 * Igual a createRun, mas informando se a corrida foi mesmo CRIADA agora. O
 * backend responde 201 quando criou e 200 quando reconheceu o external_id como
 * ja importado e devolveu o registro existente — e a unica forma do chamador
 * saber a diferenca, ja que nos dois casos vem uma corrida valida no corpo.
 * Usado pela importacao de treinos (services/workoutAutoImport.ts) pra contar
 * certo quantos treinos entraram de verdade.
 */
export async function createRunFromImport(
  payload: RunCreatePayload
): Promise<{ run: RunCreateResult; created: boolean }> {
  const response = await api.post<RunCreateResult>('/runs/', payload);
  return { run: response.data, created: response.status === 201 };
}

export async function listRuns(): Promise<Run[]> {
  const response = await api.get<Run[]>('/runs/');
  return response.data;
}

export async function getRun(id: string): Promise<RunDetail> {
  const response = await api.get<RunDetail>(`/runs/${id}`);
  return response.data;
}

/** Chamada de IA pode demorar mais que o timeout padrao — mesma folga usada em meals/workout-plans. */
export async function getRunInsight(id: string): Promise<ActivityInsight> {
  const response = await api.get<ActivityInsight>(`/runs/${id}/insight`, { timeout: 45000 });
  return response.data;
}

export async function createManualActivity(payload: ManualActivityCreatePayload): Promise<ManualActivity> {
  const response = await api.post<ManualActivity>('/activities/manual', payload);
  return response.data;
}

/** Ver createRunFromImport — mesma distincao 201 (criou) / 200 (ja existia). */
export async function createManualActivityFromImport(
  payload: ManualActivityCreatePayload
): Promise<{ activity: ManualActivity; created: boolean }> {
  const response = await api.post<ManualActivity>('/activities/manual', payload);
  return { activity: response.data, created: response.status === 201 };
}

export async function listManualActivities(): Promise<ManualActivity[]> {
  const response = await api.get<ManualActivity[]>('/activities/manual');
  return response.data;
}

export async function getManualActivity(id: string): Promise<ManualActivity> {
  const response = await api.get<ManualActivity>(`/activities/manual/${id}`);
  return response.data;
}

export async function getManualActivityInsight(id: string): Promise<ActivityInsight> {
  const response = await api.get<ActivityInsight>(`/activities/manual/${id}/insight`, { timeout: 45000 });
  return response.data;
}

export interface DistanceRecord {
  distance_meters: number;
  run_id: string;
  achieved_at: string;
}

export interface DurationRecord {
  duration_seconds: number;
  run_id: string;
  achieved_at: string;
}

export interface PaceRecord {
  avg_pace_seconds_per_km: number;
  distance_meters: number;
  run_id: string;
  achieved_at: string;
}

export interface ActivityTypeRecords {
  longest_distance: DistanceRecord | null;
  longest_duration: DurationRecord | null;
  /** chave: '1km' | '5km' | '10km' — so aparece se houver atividade dentro da tolerancia */
  best_pace_by_reference: Record<string, PaceRecord>;
}

export interface PersonalRecords {
  /** chave: activity_type ('run', 'bike', etc.) */
  records_by_activity_type: Record<string, ActivityTypeRecords>;
}

export async function getPersonalRecords(): Promise<PersonalRecords> {
  const response = await api.get<PersonalRecords>('/runs/personal-records');
  return response.data;
}

/**
 * O backend serializa datetimes "ingenuos" em UTC sem sufixo de fuso
 * (ex: "2026-07-25T14:30:00"). Sem tratar isso, o JS interpretaria a
 * string como horario local, causando erro sistematico de fuso.
 */
export function parseUtcDate(isoDate: string): Date {
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoDate);
  return new Date(hasTimezone ? isoDate : `${isoDate}Z`);
}

export function formatActivityDate(isoDate: string): string {
  return parseUtcDate(isoDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm == null) return '--';
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  run: 'Corrida',
  bike: 'Bike',
  walk: 'Caminhada',
  swim: 'Natacao',
  fight: 'Luta',
  hiit: 'HIIT',
  other: 'Outro',
};

export const ACTIVITY_TYPE_ICONS: Record<ActivityType, ComponentProps<typeof Ionicons>['name']> = {
  run: 'walk',
  bike: 'bicycle',
  // 'walk' (o glifo) ja e usado pra Corrida acima — Caminhada usa
  // "footsteps" pra nao repetir o mesmo icone com significados diferentes.
  walk: 'footsteps',
  swim: 'water',
  fight: 'fitness',
  hiit: 'flash',
  other: 'body',
};
