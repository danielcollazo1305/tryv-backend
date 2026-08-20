import type { HeatmapDay } from '@/components/HeatmapGrid';
import { api } from '@/services/api';
import { UserBrief } from '@/services/social';

export type ChallengeCategory = 'musculacao_corrida' | 'alimentacao';

// 'manual': check-in binario de sempre ("Fiz hoje"). Os outros 3 tem
// progresso calculado automaticamente pelo backend a partir de
// Refeicoes/Corridas/Sessoes de treino — ver getChallengeProgress e
// buildAutomaticChallengeHeatmapDays abaixo, nao gravam ChallengeCheckin.
export type GoalType = 'manual' | 'nutrition' | 'distance' | 'training_frequency';

export interface Challenge {
  id: string;
  trainer_id: string | null;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  participants_count: number;
  is_official: boolean;
  category: ChallengeCategory | null;
  goal_type: GoalType;
  target_value: number | null;
  target_unit: string | null;
  target_frequency_per_week: number | null;
  community_progress_percent: number;
  created_at: string;
}

export interface ChallengeCreatePayload {
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  is_official?: boolean;
  category?: ChallengeCategory | null;
}

export interface ChallengeCheckin {
  id: string;
  user_id: string;
  challenge_id: string;
  date: string;
  photo_url: string | null;
  shared_publicly: boolean;
  created_at: string;
}

export interface ChallengeCheckinCreatePayload {
  photo_url?: string | null;
  shared_publicly?: boolean;
}

export async function createChallenge(payload: ChallengeCreatePayload): Promise<Challenge> {
  const response = await api.post<Challenge>('/challenges', payload);
  return response.data;
}

/** Aba "App" — desafios oficiais do Tryv, filtrados por categoria. */
export async function listChallenges(filters: {
  is_official?: boolean;
  category?: ChallengeCategory;
}): Promise<Challenge[]> {
  const response = await api.get<Challenge[]>('/challenges', { params: filters });
  return response.data;
}

/**
 * Desafios ativos que o usuario logado participa — usado pra previa de
 * progresso na Home (is_official=true) e pra secao de desafios de
 * profissional no Perfil (is_official=false).
 */
export async function listMyActiveChallenges(filters: { is_official?: boolean } = {}): Promise<Challenge[]> {
  const response = await api.get<Challenge[]>('/challenges/mine', { params: filters });
  return response.data;
}

export async function listTrainerChallenges(trainerId: string): Promise<Challenge[]> {
  const response = await api.get<Challenge[]>(`/trainers/${trainerId}/challenges`);
  return response.data;
}

export async function getChallenge(challengeId: string): Promise<Challenge> {
  const response = await api.get<Challenge>(`/challenges/${challengeId}`);
  return response.data;
}

export async function joinChallenge(challengeId: string): Promise<Challenge> {
  const response = await api.post<Challenge>(`/challenges/${challengeId}/join`);
  return response.data;
}

export async function leaveChallenge(challengeId: string): Promise<void> {
  await api.delete(`/challenges/${challengeId}/join`);
}

export async function listChallengeParticipants(challengeId: string): Promise<UserBrief[]> {
  const response = await api.get<UserBrief[]>(`/challenges/${challengeId}/participants`);
  return response.data;
}

export async function createChallengeCheckin(
  challengeId: string,
  payload: ChallengeCheckinCreatePayload
): Promise<ChallengeCheckin> {
  const response = await api.post<ChallengeCheckin>(`/challenges/${challengeId}/checkins`, payload);
  return response.data;
}

export async function listMyChallengeCheckins(challengeId: string): Promise<ChallengeCheckin[]> {
  const response = await api.get<ChallengeCheckin[]>(`/challenges/${challengeId}/checkins/me`);
  return response.data;
}

export interface ChallengeProgressDay {
  date: string;
  achieved: boolean;
}

/**
 * Equivalente a listMyChallengeCheckins pros 3 goal_type automaticos —
 * 400 se o desafio for 'manual' (esse usa listMyChallengeCheckins). Dia a
 * dia do inicio do desafio ate hoje/end_date, calculado sob demanda no
 * backend a partir de Refeicoes/Corridas/Sessoes de treino.
 */
export async function getChallengeProgress(challengeId: string): Promise<ChallengeProgressDay[]> {
  const response = await api.get<ChallengeProgressDay[]>(`/challenges/${challengeId}/progress/me`);
  return response.data;
}

/**
 * O backend serializa datetimes "ingenuos" em UTC sem sufixo de fuso —
 * sem tratar isso, o JS interpretaria a string como horario local.
 */
export function parseUtcDate(isoDate: string): Date {
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoDate);
  return new Date(hasTimezone ? isoDate : `${isoDate}Z`);
}

export function formatChallengeDate(isoDate: string): string {
  return parseUtcDate(isoDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Percorre start_date do desafio ate hoje ou end_date (o que vier
 * primeiro), montando um HeatmapDay por dia — `isDone` decide a
 * intensidade (indice mais alto da paleta de HeatmapGrid pra "fez", 0 pra
 * "nao fez"). Compartilhado por buildChallengeHeatmapDays (checkins reais,
 * goal_type='manual') e buildAutomaticChallengeHeatmapDays (progresso
 * calculado, os outros 3 goal_type) pra nao duplicar a construcao do
 * intervalo de datas.
 */
function buildChallengeDateRangeDays(challenge: Challenge, isDone: (dateKey: string) => boolean): HeatmapDay[] {
  const start = parseUtcDate(challenge.start_date);
  const end = parseUtcDate(challenge.end_date);
  const now = new Date();
  const last = end < now ? end : now;

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastLocal = new Date(last.getFullYear(), last.getMonth(), last.getDate());

  const days: HeatmapDay[] = [];
  while (cursor <= lastLocal) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate()
    ).padStart(2, '0')}`;
    days.push({ date: key, intensity: isDone(key) ? 3 : 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Dias do heatmap de consistencia pra goal_type='manual' — mesmo formato
 * {date,intensity} de TrainingDay, a partir dos check-ins reais do
 * usuario. Compartilhado entre a tela de detalhe do desafio, a previa da
 * Home e a secao do Perfil — todos mostram o mesmo heatmap, so em
 * tamanhos diferentes.
 */
export function buildChallengeHeatmapDays(challenge: Challenge, checkins: ChallengeCheckin[]): HeatmapDay[] {
  const checkinDates = new Set(checkins.map((c) => c.date));
  return buildChallengeDateRangeDays(challenge, (key) => checkinDates.has(key));
}

/**
 * Equivalente a buildChallengeHeatmapDays pros 3 goal_type automaticos —
 * usa o progresso calculado (getChallengeProgress) em vez de check-ins
 * reais, que nao existem pra esses tipos.
 */
export function buildAutomaticChallengeHeatmapDays(challenge: Challenge, progressDays: ChallengeProgressDay[]): HeatmapDay[] {
  const achievedDates = new Set(progressDays.filter((d) => d.achieved).map((d) => d.date));
  return buildChallengeDateRangeDays(challenge, (key) => achievedDates.has(key));
}

/** "Dia X de Y" do periodo do desafio — usado na previa de progresso da Home. */
export function challengeDayProgress(challenge: Challenge): { current: number; total: number } {
  const start = parseUtcDate(challenge.start_date);
  const end = parseUtcDate(challenge.end_date);
  const now = new Date();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
  const elapsed = Math.round((Math.min(now.getTime(), end.getTime()) - start.getTime()) / MS_PER_DAY) + 1;
  return { current: Math.min(total, Math.max(1, elapsed)), total };
}

/**
 * Texto explicando a meta automatica (null pra 'manual', que nao precisa
 * de explicacao alem do proprio botao "Fiz hoje"). Assume proteina pra
 * 'nutrition' porque e o unico caso desenhado/testado ate agora (criacao
 * de desafio ainda e so via API admin, sem tela) — generalizar pra
 * target_unit arbitrario so quando houver mais de uma unidade de verdade
 * em uso.
 */
export function describeChallengeGoal(challenge: Challenge): string | null {
  switch (challenge.goal_type) {
    case 'nutrition':
      return `Meta automática: ${challenge.target_value}g de proteína por dia, calculada a partir das suas Refeições registradas.`;
    case 'distance':
      return `Meta automática: corridas de pelo menos ${challenge.target_value}km, ${challenge.target_frequency_per_week}x por semana, calculada a partir das suas Corridas registradas.`;
    case 'training_frequency':
      return `Meta automática: ${challenge.target_frequency_per_week} treinos por semana, calculada a partir das suas sessões de treino registradas.`;
    default:
      return null;
  }
}
