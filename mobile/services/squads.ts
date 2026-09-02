import { api } from '@/services/api';

export interface SquadMember {
  user_id: string;
  name: string;
  total_xp: number;
  is_you: boolean;
}

export interface Squad {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  member_count: number;
  max_members: number;
  members: SquadMember[];
}

export interface LevelInfo {
  level: number;
  xp_current: number;
  xp_next_level: number;
  total_xp: number;
}

export interface SquadMe {
  level_info: LevelInfo;
  squad: Squad | null;
}

export interface IndividualRankingEntry {
  position: number;
  user_id: string;
  name: string;
  squad_name: string | null;
  total_xp: number;
  weekly_xp: number;
}

export interface SquadRankingEntry {
  position: number;
  squad_id: string;
  name: string;
  member_count: number;
  total_xp: number;
  weekly_xp: number;
}

export interface TerritoryCity {
  city: string;
  total_points: number;
  dominant_squad_id: string | null;
  dominant_squad_name: string | null;
  dominant_squad_percent: number | null;
}

export async function createSquad(name: string): Promise<Squad> {
  const response = await api.post<Squad>('/squads/', { name });
  return response.data;
}

export async function joinSquad(inviteCode: string): Promise<Squad> {
  const response = await api.post<Squad>('/squads/join', { invite_code: inviteCode });
  return response.data;
}

export async function leaveSquad(): Promise<void> {
  await api.delete('/squads/membership');
}

export async function deleteSquad(squadId: string): Promise<void> {
  await api.delete(`/squads/${squadId}`);
}

export async function getMySquad(): Promise<SquadMe> {
  const response = await api.get<SquadMe>('/squads/me');
  return response.data;
}

export async function getIndividualRanking(limit = 20, offset = 0): Promise<IndividualRankingEntry[]> {
  const response = await api.get<IndividualRankingEntry[]>('/ranking/individual', { params: { limit, offset } });
  return response.data;
}

export async function getSquadRanking(limit = 20, offset = 0): Promise<SquadRankingEntry[]> {
  const response = await api.get<SquadRankingEntry[]>('/ranking/squads', { params: { limit, offset } });
  return response.data;
}

export async function getTerritory(): Promise<TerritoryCity[]> {
  const response = await api.get<TerritoryCity[]>('/territory');
  return response.data;
}
