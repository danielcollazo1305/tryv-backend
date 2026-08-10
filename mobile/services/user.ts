import { User } from '@/context/AuthContext';
import { api } from '@/services/api';

export interface UserUpdatePayload {
  weight?: number;
  height?: number;
  goal?: string;
  daily_calorie_goal?: number;
}

export interface TeamBadge {
  trainer_name: string;
  professional_type: 'personal_trainer' | 'nutritionist';
}

export interface UserBadges {
  is_pro: boolean;
  teams: TeamBadge[];
}

export async function updateProfile(payload: UserUpdatePayload): Promise<User> {
  const response = await api.patch<User>('/users/me', payload);
  return response.data;
}

export async function getUserBadges(userId: string): Promise<UserBadges> {
  const response = await api.get<UserBadges>(`/users/${userId}/badges`);
  return response.data;
}
