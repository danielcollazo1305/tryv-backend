import { api } from '@/services/api';

export type PostType = 'photo' | 'video' | 'progress' | 'achievement' | 'workout' | 'run';
// 'private' renomeado pra 'followers' — sempre se comportou como "so
// seguidores + o proprio autor", nunca foi de fato privado (ver
// _can_view_post no backend). "Nao compartilhar" (privacidade em 3
// niveis) nao e um valor de Post — e a ausencia de post, ver
// ShareVisibility abaixo, usado nos toggles de "Compartilhar no Feed".
export type PostVisibility = 'public' | 'followers';

export type ShareVisibility = 'none' | PostVisibility;

// Origem do post (o servidor so mostra no Explorar os 'manual'): 'manual' = a pessoa escreveu na tela de novo post;
// 'auto' = o app gerou o post ao compartilhar refeicao ou check-in. Sem origem = nao envia o campo (servidor trata como antigo).
export type PostOrigin = 'manual' | 'auto';

/**
 * Reaproveitado pelos 3 lugares que hoje tem um toggle "Compartilhar no
 * Feed" — Refeicoes (meal/add.tsx) e check-in de Desafio
 * (challenges/[id].tsx). Nao usado em social/new.tsx: la a pessoa ja esta
 * na tela de criar post, "nao compartilhar" nao faz sentido (o post e o
 * proprio proposito da tela) — so um seletor Publico/Seguidores.
 */
export const SHARE_VISIBILITY_OPTIONS: { value: ShareVisibility; label: string }[] = [
  { value: 'none', label: 'Nao compartilhar' },
  { value: 'followers', label: 'Seguidores' },
  { value: 'public', label: 'Publico' },
];

export interface Post {
  id: string;
  user_id: string;
  author: string;
  /** Avatar visivel para quem ve (null = mostrar iniciais; menores de 18 e quem nao informou a idade vem null). */
  avatar_url?: string | null;
  avatar_thumb_url?: string | null;
  type: string;
  caption: string | null;
  media_url: string | null;
  visibility: string;
  reference_id: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  is_liked_by_me: boolean;
}

export interface PostCreatePayload {
  type: PostType;
  caption?: string | null;
  media_url?: string | null;
  visibility?: PostVisibility;
  origin?: PostOrigin;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  author: string;
  avatar_url?: string | null;
  avatar_thumb_url?: string | null;
  content: string;
  created_at: string;
}

export interface UserBrief {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatar_thumb_url?: string | null;
}

export interface UserSearchResult {
  id: string;
  name: string;
  is_following: boolean;
  avatar_url?: string | null;
  avatar_thumb_url?: string | null;
}

export interface MatchedContact {
  contact_ref: string;
  id: string;
  name: string;
  is_following: boolean;
  avatar_url?: string | null;
  avatar_thumb_url?: string | null;
}

export interface ContactEntry {
  contact_ref: string;
  phone_numbers: string[];
}

export async function getFeed(limit: number, offset: number): Promise<Post[]> {
  const response = await api.get<Post[]>('/feed', { params: { limit, offset } });
  return response.data;
}

export async function createPost(payload: PostCreatePayload): Promise<Post> {
  const response = await api.post<Post>('/posts', payload);
  return response.data;
}

export async function getPost(postId: string): Promise<Post> {
  const response = await api.get<Post>(`/posts/${postId}`);
  return response.data;
}

export async function deletePost(postId: string): Promise<void> {
  await api.delete(`/posts/${postId}`);
}

export async function listUserPosts(userId: string): Promise<Post[]> {
  const response = await api.get<Post[]>(`/users/${userId}/posts`);
  return response.data;
}

/** Perfil publico minimo (GET /users/{id}/profile). Avatar null = iniciais (menor de 18 ou sem data de nascimento). */
export interface PublicProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  /** Eu bloqueei esta pessoa (aditivo; ausente em API antiga = false). */
  is_blocked_by_me?: boolean;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const response = await api.get<PublicProfile>(`/users/${userId}/profile`);
  return response.data;
}

export async function followUser(userId: string): Promise<void> {
  await api.post(`/users/${userId}/follow`);
}

export async function unfollowUser(userId: string): Promise<void> {
  await api.delete(`/users/${userId}/follow`);
}

export async function listFollowers(userId: string): Promise<UserBrief[]> {
  const response = await api.get<UserBrief[]>(`/users/${userId}/followers`);
  return response.data;
}

export async function listFollowing(userId: string): Promise<UserBrief[]> {
  const response = await api.get<UserBrief[]>(`/users/${userId}/following`);
  return response.data;
}

export async function searchUsers(query: string, limit = 20): Promise<UserSearchResult[]> {
  const response = await api.get<UserSearchResult[]>('/users/search', { params: { q: query, limit } });
  return response.data;
}

export async function getSuggestions(limit = 20): Promise<UserSearchResult[]> {
  const response = await api.get<UserSearchResult[]>('/users/suggestions', { params: { limit } });
  return response.data;
}

/** So envia os numeros normalizados por contato (contact_ref e um id local, nao sensivel) -- nunca nome/foto/email do contato (ver services/contacts.ts). */
export async function matchContacts(contacts: ContactEntry[]): Promise<MatchedContact[]> {
  const response = await api.post<MatchedContact[]>('/users/match-contacts', { contacts });
  return response.data;
}

export async function likePost(postId: string): Promise<void> {
  await api.post(`/posts/${postId}/like`);
}

export async function unlikePost(postId: string): Promise<void> {
  await api.delete(`/posts/${postId}/like`);
}

export async function listComments(postId: string): Promise<Comment[]> {
  const response = await api.get<Comment[]>(`/posts/${postId}/comments`);
  return response.data;
}

export async function createComment(postId: string, content: string): Promise<Comment> {
  const response = await api.post<Comment>(`/posts/${postId}/comments`, { content });
  return response.data;
}

export async function deleteComment(commentId: string): Promise<void> {
  await api.delete(`/comments/${commentId}`);
}

/**
 * O backend serializa datetimes "ingenuos" em UTC sem sufixo de fuso —
 * sem tratar isso, o JS interpretaria a string como horario local.
 */
export function parseUtcDate(isoDate: string): Date {
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoDate);
  return new Date(hasTimezone ? isoDate : `${isoDate}Z`);
}

export function formatPostDate(isoDate: string): string {
  const date = parseUtcDate(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes}min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
