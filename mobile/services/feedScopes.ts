// Feed do Social com duas visoes: Seguindo e Explorar. Tudo aqui e PURO (sem React e sem rede) para ser testado no Node
// (Claude outputs/try_feed_abas.mjs): estado de cada visao, montagem do pedido de pagina, aplicacao da resposta e a
// descoberta "o Explorar esta liberado no servidor?" (com cache da sessao).
import type { Post } from '@/services/social';

export type FeedScope = 'following' | 'explore';

export const FEED_PAGE_SIZE = 20;

// Mensagens FIXAS do app (nunca o texto que o servidor mandar).
export const EXPLORE_EMPTY_MESSAGE = 'Ainda não há posts para explorar.';
export const EXPLORE_ERROR_MESSAGE = 'Não foi possível carregar o Explorar.';
export const EXPLORE_RETRY_LABEL = 'Tentar de novo';

export interface ScopeState {
  posts: Post[];
  /** Ja carregou a 1a pagina ao menos uma vez (para nao recarregar so por trocar de aba). */
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  /** Seguindo: a ultima pagina veio cheia. Explorar: o servidor mandou um cursor da proxima pagina. */
  hasMore: boolean;
  error: boolean;
  /** Explorar: cursor opaco da proxima pagina (cabecalho X-Next-Cursor da ultima resposta). Nunca interpretado. */
  cursor: string | null;
}

export type ScopeStates = Record<FeedScope, ScopeState>;

export function emptyScopeState(): ScopeState {
  return { posts: [], loaded: false, loading: false, refreshing: false, loadingMore: false, hasMore: true, error: false, cursor: null };
}

export function initialScopeStates(): ScopeStates {
  return { following: emptyScopeState(), explore: emptyScopeState() };
}

/** Atualiza SO a visao pedida; a outra continua exatamente como estava (e o que preserva o estado ao alternar). */
export function patchScope(states: ScopeStates, scope: FeedScope, patch: Partial<ScopeState>): ScopeStates {
  return { ...states, [scope]: { ...states[scope], ...patch } };
}

/** Acrescenta posts sem repetir ids ja presentes (defesa extra; o cursor do servidor ja evita repeticao). */
export function mergePosts(prev: Post[], incoming: Post[]): Post[] {
  const seen = new Set(prev.map((p) => p.id));
  return [...prev, ...incoming.filter((p) => !seen.has(p.id))];
}

/** Seguindo abre por padrao; se nao sigo ninguem e o Explorar esta liberado, abre no Explorar em vez de mostrar o vazio. */
export function pickInitialScope(exploreAvailable: boolean, followingCount: number | null): FeedScope {
  return exploreAvailable && followingCount === 0 ? 'explore' : 'following';
}

export interface FeedPageRequest {
  scope: FeedScope;
  limit: number;
  /** So no Seguindo (paginacao por offset). */
  offset?: number;
  /** So no Explorar, e so quando NAO e recarga do topo. */
  cursor?: string;
}

/** Pedido da proxima pagina. `reset` = recarregar do topo (pull-to-refresh, abrir a tela): sem offset e SEM cursor. */
export function buildPageRequest(scope: FeedScope, state: ScopeState, reset: boolean): FeedPageRequest {
  if (scope === 'following') return { scope, limit: FEED_PAGE_SIZE, offset: reset ? 0 : state.posts.length };
  return reset || !state.cursor ? { scope, limit: FEED_PAGE_SIZE } : { scope, limit: FEED_PAGE_SIZE, cursor: state.cursor };
}

export interface FeedPageResult {
  posts: Post[];
  /** Explorar: valor do cabecalho X-Next-Cursor; null/ausente = acabaram os posts. */
  nextCursor?: string | null;
}

/** Aplica a resposta de uma pagina ao estado da visao. */
export function applyPage(state: ScopeState, scope: FeedScope, result: FeedPageResult, reset: boolean): ScopeState {
  const posts = reset ? result.posts : mergePosts(state.posts, result.posts);
  const nextCursor = scope === 'explore' ? result.nextCursor ?? null : null;
  const hasMore = scope === 'explore' ? nextCursor !== null : result.posts.length === FEED_PAGE_SIZE;
  return { ...state, posts, loaded: true, error: false, hasMore, cursor: nextCursor };
}

export function canLoadMore(state: ScopeState): boolean {
  return state.loaded && state.hasMore && !state.loading && !state.loadingMore && !state.refreshing && !state.error;
}

// ---------------------------------------------------------------------------------------------- descoberta do Explorar
export type ExploreProbeResult = 'available' | 'unavailable' | 'error';

/**
 * Verifica UMA vez por sessao se o servidor liberou o Explorar (chamada scope=explore&limit=1). Regras:
 *  - liberado (200) = true; "indisponivel" (404, chave desligada no servidor) = false; os dois ficam guardados na sessao;
 *  - qualquer outro erro (rede, 5xx...) = false para esta abertura (sem seletor), mas NAO fica guardado: da proxima vez que o
 *    Feed abrir, tenta de novo (uma falha de rede passageira nao esconde o Explorar ate fechar o app);
 *  - chamadas simultaneas dividem a mesma consulta.
 */
export function createExploreAvailability(probe: () => Promise<ExploreProbeResult>) {
  let cached: boolean | null = null;
  let inFlight: Promise<boolean> | null = null;
  const check = (): Promise<boolean> => {
    if (cached !== null) return Promise.resolve(cached);
    if (inFlight) return inFlight;
    inFlight = probe()
      .then((result) => {
        if (result === 'available') cached = true;
        else if (result === 'unavailable') cached = false;
        return result === 'available';
      })
      .catch(() => false)
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
  const markUnavailable = () => {
    cached = false;
  };
  const reset = () => {
    cached = null;
    inFlight = null;
  };
  return { check, markUnavailable, reset };
}
