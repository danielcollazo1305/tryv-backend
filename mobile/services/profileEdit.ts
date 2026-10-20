// Editar perfil (@usuario, bio e link). Tudo aqui e PURO (sem React, sem rede e sem imports de runtime) para ser testado no Node
// (Claude outputs/try_editar_perfil_app.mjs): validacao local de formato, estado do botao Salvar, so os campos que mudaram,
// travamento do @usuario por 30 dias, disponibilidade e traducao dos erros do PATCH /users/me/profile.
//
// O servidor e a fonte da verdade (lista de reservados, filtro de linguagem, @usuario em uso, intervalo de 30 dias): aqui so se
// valida o FORMATO, para a pessoa ver o problema antes de enviar. As mensagens do servidor (em portugues) sao mostradas como vem.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const BIO_MAX = 150;
export const LINK_MAX = 200;
export const USERNAME_CHANGE_INTERVAL_DAYS = 30;

export const USERNAME_RULES_TEXT =
  '3 a 20 caracteres: letras minúsculas, números, ponto e sublinhado. Não pode começar nem terminar com ponto ou sublinhado, nem repeti-los.';
export const MINOR_NOTICE = 'Bio e link só ficam visíveis para outras pessoas a partir dos 18 anos.';
export const USERNAME_CHANGE_CONFIRM_TITLE = 'Trocar @usuário?';
export const USERNAME_CHANGE_CONFIRM_MESSAGE = 'Você só poderá trocar de novo daqui a 30 dias.';

// ----------------------------------------------------------------------------------------------------------- @usuario
/** Texto digitado -> valor do campo: minusculas, sem espacos e sem o "@" (o prefixo e fixo na tela). Limite de 20. */
export function normalizeUsernameInput(text: string): string {
  return text.toLowerCase().replace(/[\s@]/g, '').slice(0, USERNAME_MAX);
}

const USERNAME_RE = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;

/** Mensagem curta do problema de FORMATO, ou null se o formato esta certo (nao confere reservados nem se esta em uso). */
export function validateUsernameFormat(username: string): string | null {
  if (username.length === 0) return null; // vazio e tratado a parte (nao e erro de formato)
  if (username.length < USERNAME_MIN) return `Use pelo menos ${USERNAME_MIN} caracteres.`;
  if (username.length > USERNAME_MAX) return `Use no máximo ${USERNAME_MAX} caracteres.`;
  if (/[^a-z0-9._]/.test(username)) return 'Use só letras minúsculas, números, ponto e sublinhado.';
  if (/^[._]/.test(username) || /[._]$/.test(username)) return 'Não pode começar nem terminar com ponto ou sublinhado.';
  if (/[._]{2}/.test(username)) return 'Não pode ter dois pontos ou sublinhados seguidos.';
  return USERNAME_RE.test(username) ? null : 'Formato inválido.';
}

export type AvailabilityPlan = 'idle' | 'same' | 'invalid' | 'check';

/** O que fazer com o campo: nada (vazio), e o atual (nao precisa checar), formato invalido (nao chama o servidor) ou checar. */
export function availabilityPlan(draft: string, current: string | null | undefined): AvailabilityPlan {
  if (draft === '') return 'idle';
  if (draft === (current ?? '')) return 'same';
  if (validateUsernameFormat(draft) !== null) return 'invalid';
  return 'check';
}

export type UsernameStatus = 'idle' | 'same' | 'invalid' | 'checking' | 'available' | 'taken' | 'paused' | 'unknown';

export const USERNAME_STATUS_TEXT: Record<UsernameStatus, string> = {
  idle: '',
  same: '',
  invalid: '',
  checking: 'Verificando…',
  available: 'Disponível',
  taken: 'Em uso. Escolha outro.',
  paused: '',
  unknown: 'Não foi possível verificar agora. Você pode tentar salvar.',
};

/** Retry-After (segundos) de uma resposta 429 do axios; null se nao houver numero valido. */
export function parseRetryAfterSeconds(err: unknown): number | null {
  const headers = (err as { response?: { headers?: unknown } } | null | undefined)?.response?.headers as Record<string, unknown> | undefined;
  if (!headers) return null;
  const raw = typeof (headers as { get?: unknown }).get === 'function' ? (headers as { get: (k: string) => unknown }).get('retry-after') : headers['retry-after'] ?? headers['Retry-After'];
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n), 3600) : null;
}

/** Resultado de GET /users/username-available (ou do erro dele) -> estado do campo. 429 vira `paused` com o tempo a esperar. */
export function availabilityFromResponse(result: { available: boolean } | null, err?: unknown): { status: UsernameStatus; retryAfterSeconds?: number } {
  if (result) return { status: result.available ? 'available' : 'taken' };
  const status = (err as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  if (status === 429) return { status: 'paused', retryAfterSeconds: parseRetryAfterSeconds(err) ?? 30 };
  return { status: 'unknown' };
}

export function pausedMessage(seconds: number): string {
  return `Muitas verificações. Tente de novo em ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}.`;
}

// ------------------------------------------------------------------------------------------------- travamento de 30 dias
export function usernameLockText(waitDays: number): string {
  return `Você poderá trocar de novo em ${waitDays} ${waitDays === 1 ? 'dia' : 'dias'}.`;
}

/** Dias que faltam para trocar o @usuario (o numero que o servidor devolve em GET /users/me); 0 = livre. Valor ausente (servidor antigo) = livre. */
export function usernameLockDays(waitDays: number | null | undefined): number {
  return typeof waitDays === 'number' && waitDays > 0 ? Math.ceil(waitDays) : 0;
}

/** Troca = ja existe @usuario e o novo e outro (pede confirmacao). A PRIMEIRA definicao nao e troca. */
export function isUsernameChange(current: string | null | undefined, draft: string): boolean {
  return !!current && draft !== '' && draft !== current;
}

// ---------------------------------------------------------------------------------------------------------------- link
/** Mensagem do problema do link digitado, ou null se vazio (apaga) ou aceitavel. O servidor valida de novo (dominio, credenciais...). */
export function validateLink(raw: string): string | null {
  const link = raw.trim();
  if (link === '') return null;
  if (!/^https:\/\//i.test(link)) return 'O link precisa começar com https://';
  if (link.length > LINK_MAX) return `Use no máximo ${LINK_MAX} caracteres.`;
  if (/\s/.test(link)) return 'O link não pode ter espaços.';
  const authority = link.slice('https://'.length).split(/[/?#]/)[0] ?? '';
  if (authority === '' || authority.includes('@')) return 'Informe um endereço válido, sem usuário e senha.';
  if (!authority.includes('.')) return 'Informe um endereço válido, como https://exemplo.com.br';
  return null;
}

// -------------------------------------------------------------------------------------------------------- salvar / dirty
export interface ProfileDraft {
  username: string; // ja sem "@" e em minusculas
  bio: string;
  link: string;
}

export interface CurrentProfile {
  username?: string | null;
  bio?: string | null;
  link?: string | null;
}

export interface ProfilePayload {
  username?: string;
  bio?: string; // "" apaga
  link?: string; // "" apaga
}

/** SO os campos que mudaram. Bio e link vazios (apagar) vao como "". O @usuario so entra se mudou e nao esta vazio (nao pode ser apagado). */
export function buildProfilePayload(current: CurrentProfile, draft: ProfileDraft): ProfilePayload {
  const payload: ProfilePayload = {};
  if (draft.username !== '' && draft.username !== (current.username ?? '')) payload.username = draft.username;
  if (draft.bio.trim() !== (current.bio ?? '').trim()) payload.bio = draft.bio.trim();
  if (draft.link.trim() !== (current.link ?? '').trim()) payload.link = draft.link.trim();
  return payload;
}

export interface SaveState {
  canSave: boolean;
  changed: boolean;
  usernameError: string | null;
  bioError: string | null;
  linkError: string | null;
}

/** Botao Salvar: so liga se algo mudou, nada esta invalido, o @usuario novo (se mudou) nao esta em uso/invalido/sendo verificado e nao ha envio em andamento. */
export function computeSaveState(
  current: CurrentProfile,
  draft: ProfileDraft,
  opts: { saving: boolean; usernameStatus: UsernameStatus; usernameLocked: boolean }
): SaveState {
  const payload = buildProfilePayload(current, draft);
  const changed = Object.keys(payload).length > 0;
  const usernameChanged = 'username' in payload;
  const usernameError = usernameChanged && !opts.usernameLocked ? validateUsernameFormat(draft.username) : null;
  const bioError = draft.bio.trim().length > BIO_MAX ? `Use no máximo ${BIO_MAX} caracteres.` : null;
  const linkError = validateLink(draft.link);
  const usernameBlocking = usernameChanged && (opts.usernameLocked || ['invalid', 'checking', 'taken'].includes(opts.usernameStatus));
  const canSave = changed && !opts.saving && !usernameError && !bioError && !linkError && !usernameBlocking;
  return { canSave, changed, usernameError, bioError, linkError };
}

// ---------------------------------------------------------------------------------------------------------------- menor
/** Idade completa em anos de uma data 'AAAA-MM-DD' (o aniversario exato conta); null se a data nao existe/e invalida. */
export function ageFromDateString(dateOfBirth: string | null | undefined, today: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  let age = today.getFullYear() - y;
  if (today.getMonth() < mo || (today.getMonth() === mo && today.getDate() < d)) age -= 1;
  return age;
}

/** Mostra a linha "Bio e link so ficam visiveis ... a partir dos 18 anos" para menor de 18 ou sem data de nascimento (mesma regra do servidor). */
export function shouldShowMinorNotice(dateOfBirth: string | null | undefined, today: Date = new Date()): boolean {
  const age = ageFromDateString(dateOfBirth, today);
  return age === null || age < 18;
}

// ---------------------------------------------------------------------------------------------------------------- erros
export type ProfileErrorField = 'username' | 'bio' | 'link' | 'general';

export interface ProfileUpdateError {
  field: ProfileErrorField;
  message: string;
  status?: number;
}

export const PROFILE_MESSAGES = {
  network: 'Sem conexão. Verifique a internet e tente de novo.',
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  unavailable: 'Não foi possível salvar agora. Tente novamente mais tarde.',
  invalid: 'Não foi possível salvar. Confira os campos e tente novamente.',
} as const;

function statusOf(err: unknown): number | undefined {
  const s = (err as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  return typeof s === 'number' ? s : undefined;
}

function detailOf(err: unknown): string | null {
  const d = (err as { response?: { data?: { detail?: unknown } } } | null | undefined)?.response?.data?.detail;
  return typeof d === 'string' && d.trim() !== '' ? d : null;
}

/** De qual campo e a mensagem do servidor (o PATCH pode levar varios campos de uma vez). Pelas palavras que o proprio servidor usa. */
export function fieldFromMessage(message: string): ProfileErrorField {
  if (/@usu[aá]rio/i.test(message)) return 'username';
  if (/\blink\b|https:\/\//i.test(message)) return 'link';
  if (/\bbio\b/i.test(message)) return 'bio';
  return 'general';
}

/**
 * Traduz o erro do PATCH /users/me/profile. `filterMessage` = getContentFilterMessage(err) de services/contentFilter.ts (texto barrado pelo
 * filtro, 422 com cabecalho, ou pausa 429): a mensagem generica do filtro so vale para a BIO (o @usuario tem a sua, "Escolha outro @usuário.").
 * A mensagem de 422/409 vem do servidor, em portugues, exatamente como esta (inclusive o "Tente novamente em N dias").
 */
export function classifyProfileUpdateError(err: unknown, filterMessage: string | null = null): ProfileUpdateError {
  const status = statusOf(err);
  if (status === undefined) {
    return (err as { response?: unknown } | null | undefined)?.response ? { field: 'general', message: PROFILE_MESSAGES.unavailable } : { field: 'general', message: PROFILE_MESSAGES.network };
  }
  const detail = detailOf(err);
  if (status === 401) return { field: 'general', message: PROFILE_MESSAGES.unauthorized, status };
  if (status === 409) return { field: 'username', message: detail ?? 'Esse @usuário já está em uso. Escolha outro.', status };
  if (status === 429) {
    if (filterMessage) return { field: fieldFromMessage(filterMessage) === 'username' ? 'username' : 'general', message: filterMessage, status };
    return { field: 'general', message: detail ?? PROFILE_MESSAGES.unavailable, status };
  }
  if (status === 422) {
    if (filterMessage) {
      const f = fieldFromMessage(filterMessage);
      return { field: f === 'general' ? 'bio' : f, message: filterMessage, status };
    }
    if (detail) return { field: fieldFromMessage(detail), message: detail, status };
    return { field: 'general', message: PROFILE_MESSAGES.invalid, status };
  }
  return { field: 'general', message: PROFILE_MESSAGES.unavailable, status };
}
