import { api } from '@/services/api';

export type PostType = 'photo' | 'video' | 'progress' | 'achievement' | 'workout' | 'run';
export type PostVisibility = 'public' | 'private';

export interface Post {
  id: string;
  user_id: string;
  author: string;
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
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface UserBrief {
  id: string;
  name: string;
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
