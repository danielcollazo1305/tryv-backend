import axios from 'axios';

import { api, getApiErrorMessage } from '@/services/api';
import type { UserBrief } from '@/services/social';

/** Motivos aceitos por POST /posts/{id}/report e /comments/{id}/report (backend/app/schemas/moderation.py). */
export type ReportReason = 'spam' | 'assedio' | 'nudez' | 'violencia' | 'menor' | 'outro';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'assedio', label: 'Assédio' },
  { value: 'nudez', label: 'Nudez' },
  { value: 'violencia', label: 'Violência' },
  { value: 'menor', label: 'Envolve menor de idade' },
  { value: 'outro', label: 'Outro' },
];

/** `details` aceita ate 500 caracteres (ReportCreate.details, max_length=500). */
export const REPORT_DETAILS_MAX = 500;

/** Bloqueia o usuario (204, idempotente). Remove o seguimento nos dois sentidos. */
export async function blockUser(userId: string): Promise<void> {
  await api.post(`/users/${userId}/block`);
}

/** Desbloqueia (204, idempotente). */
export async function unblockUser(userId: string): Promise<void> {
  await api.delete(`/users/${userId}/block`);
}

/** Quem EU bloqueei (nunca quem me bloqueou). Avatar ja vem filtrado pelo backend (regra de menores). */
export async function listBlockedUsers(): Promise<UserBrief[]> {
  const response = await api.get<UserBrief[]>('/users/me/blocks');
  return response.data;
}

export interface ReportResult {
  id: string;
  status: string;
  created_at: string;
}

/** 201 (criada) e 200 (ja denunciada por mim) sao sucesso: o axios so levanta erro fora de 2xx. */
export async function reportPost(postId: string, reason: ReportReason, details?: string): Promise<ReportResult> {
  const response = await api.post<ReportResult>(`/posts/${postId}/report`, { reason, details: details?.trim() || undefined });
  return response.data;
}

export async function reportComment(commentId: string, reason: ReportReason, details?: string): Promise<ReportResult> {
  const response = await api.post<ReportResult>(`/comments/${commentId}/report`, { reason, details: details?.trim() || undefined });
  return response.data;
}

export type ModerationErrorKind = 'content_unavailable' | 'route_missing' | 'network' | 'other';

export interface ModerationError {
  kind: ModerationErrorKind;
  message: string;
}

/**
 * Traduz um erro das rotas de bloquear/denunciar. Rota inexistente (405, ou 404 com o corpo padrao
 * `{"detail":"Not Found"}` do FastAPI = API em producao ainda sem estes endpoints) NAO e "conteudo indisponivel": o
 * 404 de verdade do backend traz um `detail` proprio ("Post nao encontrado", "Usuario nao encontrado"...).
 */
export function classifyModerationError(err: unknown, fallback: string): ModerationError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (status === 405 || (status === 404 && (detail === 'Not Found' || detail === undefined))) {
      return { kind: 'route_missing', message: 'Este recurso ainda não está disponível. Tente novamente mais tarde.' };
    }
    if (status === 404) {
      return { kind: 'content_unavailable', message: 'Conteúdo indisponível.' };
    }
    if (!err.response) {
      return { kind: 'network', message: 'Sem conexão. Verifique a internet e tente novamente.' };
    }
  }
  return { kind: 'other', message: getApiErrorMessage(err, fallback) };
}
