/**
 * Classificacao dos erros de POST /users/me/delete (backend/app/routers/users.py, delete_my_account). Arquivo SEM
 * imports de proposito: e puro e roda em Node (a prova ponta a ponta fica em Claude outputs/). O erro do axios e
 * reconhecido por `isAxiosError` (mesma checagem de axios.isAxiosError), sem importar o axios.
 */

/** Palavra que o backend exige em `confirmation` (comparada depois de strip, maiusculas). */
export const DELETE_CONFIRMATION_WORD = 'EXCLUIR';

/** Texto exato do `detail` do 401 de senha errada (backend: HTTPException "Senha incorreta"). */
export const WRONG_PASSWORD_DETAIL = 'Senha incorreta';

export type DeleteAccountErrorKind =
  | 'wrong_password'
  | 'blocked'
  | 'too_many'
  | 'stripe_failed'
  | 'route_missing'
  | 'network'
  | 'session_expired'
  | 'other';

export interface DeleteAccountError {
  kind: DeleteAccountErrorKind;
  message: string;
}

interface AxiosLikeError {
  isAxiosError?: boolean;
  response?: { status?: number; data?: unknown; headers?: unknown };
}

function readRetryAfterSeconds(headers: unknown): number | null {
  if (!headers || typeof headers !== 'object') return null;
  const bag = headers as Record<string, unknown> & { get?: (name: string) => unknown };
  const raw = typeof bag.get === 'function' ? bag.get('retry-after') : (bag['retry-after'] ?? bag['Retry-After']);
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Os botoes habilitam so com a confirmacao EXATA (trim + maiusculas, igual ao backend) e a senha preenchida. */
export function canSubmitDeletion(confirmation: string, password: string): boolean {
  return confirmation.trim() === DELETE_CONFIRMATION_WORD && password.length > 0;
}

export function classifyDeleteAccountError(err: unknown): DeleteAccountError {
  const e = err as AxiosLikeError | null;
  if (!e || e.isAxiosError !== true) {
    return { kind: 'other', message: 'Não foi possível excluir a conta. Tente novamente.' };
  }
  const response = e.response;
  if (!response) {
    return { kind: 'network', message: 'Sem conexão. Tente de novo.' };
  }
  const status = response.status;
  const rawDetail = (response.data as { detail?: unknown } | null | undefined)?.detail;
  const detail = typeof rawDetail === 'string' ? rawDetail : undefined;

  if (status === 401) {
    // So o 401 com o texto exato e senha errada. Qualquer outro 401 (token invalido/conta ja excluida) e sessao expirada.
    if (detail === WRONG_PASSWORD_DETAIL) return { kind: 'wrong_password', message: 'Senha incorreta.' };
    return { kind: 'session_expired', message: 'Sua sessão expirou. Entre novamente.' };
  }
  if (status === 409) {
    return { kind: 'blocked', message: detail ?? 'Não foi possível excluir a conta agora. Fale com o suporte.' };
  }
  if (status === 429) {
    const seconds = readRetryAfterSeconds(response.headers);
    if (seconds !== null) {
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return {
        kind: 'too_many',
        message: `Muitas tentativas. Tente novamente em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
      };
    }
    return { kind: 'too_many', message: 'Muitas tentativas. Tente novamente em alguns minutos.' };
  }
  if (status === 502) {
    return {
      kind: 'stripe_failed',
      message: 'Não foi possível cancelar sua assinatura agora. Tente novamente em instantes.',
    };
  }
  // API de producao ainda sem o endpoint: 405, ou 404 com o corpo padrao {"detail":"Not Found"} do FastAPI.
  if (status === 405 || (status === 404 && (detail === 'Not Found' || detail === undefined))) {
    return { kind: 'route_missing', message: 'Este recurso ainda não está disponível. Tente novamente mais tarde.' };
  }
  if (status === 422 && detail) {
    return { kind: 'other', message: detail };
  }
  return { kind: 'other', message: 'Não foi possível excluir a conta. Tente novamente.' };
}
