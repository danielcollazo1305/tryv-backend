import type { User } from '@/context/AuthContext';
import { api } from '@/services/api';
import type { ProfilePayload } from '@/services/profileEdit';

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

// E8: editar @usuario, bio e link (PATCH /users/me/profile). So os campos que mudaram; "" em bio/link apaga; o @usuario nao pode ser apagado.
export async function updateMyProfile(payload: ProfilePayload): Promise<User> {
  const response = await api.patch<User>('/users/me/profile', payload);
  return response.data;
}

// GET /users/username-available?u=... -> { available } (login obrigatorio; 429 com Retry-After se consultar demais).
export async function checkUsernameAvailable(username: string): Promise<{ available: boolean }> {
  const response = await api.get<{ available: boolean }>('/users/username-available', { params: { u: username } });
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
 * Envia a foto de perfil (depois do aviso de consentimento) pro endpoint de
 * geracao de avatar por IA (POST /users/me/avatar, ver backend/app/routers/users.py).
 * O servidor guarda a foto em local PRIVADO e o avatar anime; a imagem em uso
 * (foto ou avatar) e a que os outros veem. Timeout bem maior que
 * o upload comum (uploadMedia usa 30s) porque a geracao por IA em si leva
 * alguns segundos, alem do tempo de upload/download.
 *
 * 130 s, um pouco acima dos 120 s de timeout do servidor com a OpenAI
 * (AVATAR_OPENAI_TIMEOUT_SECONDS em backend/app/services/avatar_generation.py):
 * o app nunca desiste antes do backend. Com 60 s, uma geracao lenta fazia o app
 * mostrar erro de conexao enquanto o servidor seguia gerando, cobrando e
 * consumindo a cota de geracoes do usuario.
 */
export interface AvatarResult {
  avatar_url: string;
  avatar_thumb_url: string | null;
  avatar_source: 'photo' | 'avatar' | null;
}

/** So para o DONO (GET /users/me/avatar-options): URLs de pre-visualizacao ASSINADAS (expiram em minutos), cota restante e consentimento. */
export interface AvatarOptions {
  avatar_source: 'photo' | 'avatar' | null;
  has_photo: boolean;
  has_avatar: boolean;
  photo_preview_url: string | null;
  avatar_preview_url: string | null;
  generations_limit: number;
  generations_remaining: number;
  window_days: number;
  can_manage: boolean;
  restriction_message: string | null;
  consent_version: string;
  consented: boolean;
}

export async function getAvatarOptions(): Promise<AvatarOptions> {
  const response = await api.get<AvatarOptions>('/users/me/avatar-options');
  return response.data;
}

/** Alterna entre usar a foto ou o avatar (PUT /users/me/avatar-source): nao gera nada e nao gasta cota. Depois, chame refreshUser(). */
export async function setAvatarSource(source: 'photo' | 'avatar'): Promise<AvatarResult> {
  const response = await api.put<AvatarResult>('/users/me/avatar-source', { source });
  return response.data;
}

export async function uploadAvatarSelfie(fileUri: string, consentVersion: string): Promise<AvatarResult> {
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
  // versao do aviso de consentimento aceito (o servidor recusa se nao for a atual)
  formData.append('consent_version', consentVersion);

  const response = await api.post<AvatarResult>('/users/me/avatar', formData, { timeout: 130000 });
  return response.data;
}

/** Remove o proprio avatar (DELETE /users/me/avatar, 204, idempotente). Depois, chame refreshUser(). */
export async function deleteMyAvatar(): Promise<void> {
  await api.delete('/users/me/avatar');
}
