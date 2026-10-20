import { api } from '@/services/api';
import type { CursorPage, GalleryItem, HistoryItem } from '@/services/profileFeedState';

// Abas do SEU perfil: historico de atividades e galeria de fotos (servidor: routers/activity_history.py e routers/gallery.py).
// Respostas { items, next_cursor }; o cursor e opaco (so reenviar o que veio).

export const HISTORY_PAGE_SIZE = 20; // maximo do servidor: 50
export const GALLERY_PAGE_SIZE = 30; // maximo do servidor: 60

export interface PageParams {
  cursor?: string;
  limit?: number;
}

/** GET /users/me/activities. `type` filtra por modalidade ('workout' = treinos); sem `cursor` = do topo. */
export async function getMyActivities(params: PageParams & { type?: string } = {}): Promise<CursorPage<HistoryItem>> {
  const query: Record<string, string | number> = { limit: params.limit ?? HISTORY_PAGE_SIZE };
  if (params.cursor) query.cursor = params.cursor;
  if (params.type) query.type = params.type;
  const response = await api.get<CursorPage<HistoryItem>>('/users/me/activities', { params: query });
  return response.data;
}

/** GET /users/{userId}/gallery (`me` = a minha). Fotos de posts feitos a mao, mais recentes primeiro. */
export async function getGallery(userId: string, params: PageParams = {}): Promise<CursorPage<GalleryItem>> {
  const query: Record<string, string | number> = { limit: params.limit ?? GALLERY_PAGE_SIZE };
  if (params.cursor) query.cursor = params.cursor;
  const response = await api.get<CursorPage<GalleryItem>>(`/users/${userId}/gallery`, { params: query });
  return response.data;
}
