import { api } from '@/services/api';
import { UserBrief } from '@/services/social';

export interface Challenge {
  id: string;
  trainer_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  participants_count: number;
  created_at: string;
}

export interface ChallengeCreatePayload {
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
}

export async function createChallenge(payload: ChallengeCreatePayload): Promise<Challenge> {
  const response = await api.post<Challenge>('/challenges', payload);
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
