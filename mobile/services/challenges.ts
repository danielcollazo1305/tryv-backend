import type { HeatmapDay } from '@/components/HeatmapGrid';
import { api } from '@/services/api';
import { UserBrief } from '@/services/social';

export type ChallengeCategory = 'musculacao_corrida' | 'alimentacao';

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
 * Constroi os dias do heatmap de consistencia de um desafio (start_date ate
 * hoje ou end_date, o que vier primeiro) + os check-ins reais do usuario —
 * mesmo formato {date,intensity} de TrainingDay, so que intensidade e
 * binaria (fez ou nao fez check-in naquele dia), usando o indice mais alto
 * da paleta de HeatmapGrid pra "fez". Compartilhado entre a tela de
 * detalhe do desafio, a previa da Home e a secao do Perfil — todos
 * mostram o mesmo heatmap, so em tamanhos diferentes.
 */
export function buildChallengeHeatmapDays(challenge: Challenge, checkins: ChallengeCheckin[]): HeatmapDay[] {
  const checkinDates = new Set(checkins.map((c) => c.date));
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
    days.push({ date: key, intensity: checkinDates.has(key) ? 3 : 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
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
