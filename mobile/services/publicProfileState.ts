// Perfil de OUTRA pessoa (E9): logica PURA (sem React, sem rede), testada no Node (Claude outputs/try_perfil_outros_app.mjs).
// O servidor decide o que mostrar (menor de 18 ou sem data de nascimento: bio/link/avatar/estatisticas vem null e a galeria vem VAZIA, 200;
// bloqueio nos dois sentidos: 404). O app NAO adivinha idade: mostra so o que vier preenchido e nao explica a ausencia a terceiros.
import { linkDisplayText, openableLink } from '@/services/profileFeedState';

// ------------------------------------------------------------------------------------------------------- campos do perfil
/** Texto aparado, ou null se ausente/vazio/nao for texto (servidor antigo nao manda; servidor novo manda null quando oculto). */
export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

export interface PublicIdentity {
  name: string | null;
  username: string | null;
  bio: string | null;
  /** Link ja validado: so https (openableLink); qualquer outra coisa vira null e nao aparece. */
  link: string | null;
  linkText: string | null;
  avatarUrl: string | null;
  avatarThumbUrl: string | null;
  blockedByMe: boolean;
}

/** Resposta de GET /users/{id}/profile (qualquer versao do servidor) -> campos seguros para a tela. Ausente/nulo/tipo errado nao quebra. */
export function normalizePublicProfile(raw: unknown): PublicIdentity {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const username = cleanText(r.username);
  const link = openableLink(cleanText(r.link));
  return {
    name: cleanText(r.name),
    username: username ? username.replace(/^@+/, '') || null : null,
    bio: cleanText(r.bio),
    link,
    linkText: link ? linkDisplayText(link) : null,
    avatarUrl: cleanText(r.avatar_url),
    avatarThumbUrl: cleanText(r.avatar_thumb_url),
    blockedByMe: r.is_blocked_by_me === true,
  };
}

/** Tem algo da identidade (@usuario, bio ou link) para mostrar? Se nao, a tela nao desenha nada no lugar (sem aviso). */
export function hasIdentityLines(p: Pick<PublicIdentity, 'username' | 'bio' | 'link'>): boolean {
  return !!(p.username || p.bio || p.link);
}

/** Nome para mostrar: o do perfil; senao o autor de um post; senao a entrada na lista de quem eu sigo; senao nada (a tela usa "Perfil"). */
export function pickDisplayName(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const t = cleanText(c);
    if (t) return t;
  }
  return null;
}

// ----------------------------------------------------------------------------------------------------------------- abas
export type PublicTab = 'gallery' | 'posts' | 'activity';

// So as abas que ja tem dado publico no servidor: galeria (GET /users/{id}/gallery), posts (GET /users/{id}/posts) e atividade
// (km da semana e frequencia de treino, rotas publicas por usuario). NAO ha Historico, Progresso nem Conquistas de outra pessoa.
export const PUBLIC_TABS: { key: PublicTab; label: string }[] = [
  { key: 'gallery', label: 'Galeria' },
  { key: 'posts', label: 'Posts' },
  { key: 'activity', label: 'Atividade' },
];

export const GALLERY_EMPTY_NEUTRAL = {
  title: 'Nenhuma foto por aqui',
  text: 'Quando houver fotos, elas aparecem aqui.',
} as const;

// ------------------------------------------------------------------------------------------------------------- erros
function statusOf(err: unknown): number | undefined {
  const s = (err as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  return typeof s === 'number' ? s : undefined;
}

function detailOf(err: unknown): unknown {
  return (err as { response?: { data?: { detail?: unknown } } } | null | undefined)?.response?.data?.detail;
}

/**
 * O que fazer quando GET /users/{id}/profile falha: 'unavailable' = pessoa inexistente, que me bloqueou ou sem acesso (404/403 com `detail` em
 * texto PROPRIO do servidor): tela "Perfil indisponivel" com botao voltar, sem revelar o motivo; 'continue' = qualquer outro erro, inclusive 404
 * sem detail ou com o "Not Found" padrao (rota inexistente numa API antiga): a tela carrega sem o perfil, como sempre foi.
 */
export function profileLoadOutcome(err: unknown): 'unavailable' | 'continue' {
  const status = statusOf(err);
  const detail = detailOf(err);
  if ((status === 404 || status === 403) && typeof detail === 'string' && detail !== 'Not Found') return 'unavailable';
  return 'continue';
}

/** Galeria de outra pessoa que responde 404/403 (ex.: bloqueio feito entre uma chamada e outra) = estado vazio neutro, nunca um erro que explique. */
export function isGalleryUnavailable(err: unknown): boolean {
  const status = statusOf(err);
  return status === 404 || status === 403;
}
