import { User } from '@/context/AuthContext';
import { api } from '@/services/api';

export interface UserUpdatePayload {
  weight?: number;
  height?: number;
  goal?: string;
  daily_calorie_goal?: number;
}

export async function updateProfile(payload: UserUpdatePayload): Promise<User> {
  const response = await api.patch<User>('/users/me', payload);
  return response.data;
}
