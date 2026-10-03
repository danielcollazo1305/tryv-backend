import type { User } from '@/context/AuthContext';
import { api } from '@/services/api';

export interface UserUpdatePayload {
  weight?: number;
  height?: number;
  goal?: string;
  daily_calorie_goal?: number;
  daily_protein_goal?: number;
  date_of_birth?: string;
  biological_sex?: 'masculino' | 'feminino' | 'prefiro_nao_informar';
  body_fat_percentage?: number;
  training_level?: string;
  available_equipment?: string;
  city?: string;
  city_ibge_code?: number;
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

// Mesmo mapeamento de extensao -> mimetype de uploadMedia() em
// services/media.ts, duplicado aqui de proposito -- helper pequeno e
// autocontido, nao vale o acoplamento entre os 2 arquivos so por causa
// disso.
const AVATAR_MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
};

/**
 * Envia a selfie do usuario pro endpoint dedicado de geracao de avatar por
 * IA (POST /users/me/avatar, ver backend/app/routers/users.py) e retorna a
 * URL do resultado estilizado ja salvo no S3 -- a selfie original nunca e
 * persistida no backend (ver docstring do endpoint). Timeout bem maior que
 * o upload comum (uploadMedia usa 30s) porque a geracao por IA em si leva
 * alguns segundos, alem do tempo de upload/download.
 */
export async function uploadAvatarSelfie(fileUri: string): Promise<string> {
  const filename = fileUri.split('/').pop() ?? 'selfie.jpg';
  const extensionMatch = /\.(\w+)$/.exec(filename);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg';
  const mimeType = AVATAR_MIME_TYPES_BY_EXTENSION[extension] ?? `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  const response = await api.post<{ avatar_url: string }>('/users/me/avatar', formData, { timeout: 60000 });
  return response.data.avatar_url;
}
