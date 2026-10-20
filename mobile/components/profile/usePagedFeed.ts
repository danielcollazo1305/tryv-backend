import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CursorPage,
  PageState,
  applyPageError,
  applyPageResult,
  buildCursorRequest,
  canLoadMore,
  emptyPageState,
  shouldAutoLoad,
  startLoading,
  type LoadMode,
} from '@/services/profileFeedState';

interface Options<T> {
  /** Busca uma pagina. `cursor` ausente = do topo. */
  fetchPage: (request: { cursor?: string }) => Promise<CursorPage<T>>;
  keyOf: (item: T) => string;
  /** A aba esta aberta? So ai a 1a pagina e buscada (uma unica vez; trocar de aba nao refaz a chamada). */
  enabled: boolean;
  /** Muda quando o filtro muda: zera a lista e busca de novo (resposta do filtro anterior e descartada). */
  resetKey?: string;
}

/**
 * Lista paginada por cursor de UMA aba do perfil. Estado em services/profileFeedState.ts (funcoes puras testadas). Respostas atrasadas
 * (de uma recarga que ja foi superada, de outro filtro ou depois de sair da tela) sao descartadas; falha de uma aba nao afeta as outras.
 */
export function usePagedFeed<T>({ fetchPage, keyOf, enabled, resetKey = '' }: Options<T>) {
  const [state, setState] = useState<PageState<T>>(emptyPageState<T>());
  const stateRef = useRef(state);
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;

  const update = useCallback((fn: (s: PageState<T>) => PageState<T>) => {
    stateRef.current = fn(stateRef.current);
    setState(stateRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: LoadMode) => {
      const reset = mode !== 'more';
      if (mode === 'more' && !canLoadMore(stateRef.current)) return;
      if (reset) tokenRef.current += 1;
      const token = tokenRef.current;
      const request = buildCursorRequest(stateRef.current, reset);
      update((s) => startLoading(s, mode));
      try {
        const page = await fetchRef.current(request);
        if (!mountedRef.current || token !== tokenRef.current) return;
        update((s) => applyPageResult(s, page, reset, keyRef.current));
      } catch {
        if (!mountedRef.current || token !== tokenRef.current) return;
        update((s) => applyPageError(s, mode));
      }
    },
    [update]
  );

  // Filtro mudou: descarta a lista e qualquer resposta em andamento; a 1a pagina do novo filtro vem pelo efeito abaixo.
  const firstResetKey = useRef(resetKey);
  useEffect(() => {
    if (firstResetKey.current === resetKey) return;
    firstResetKey.current = resetKey;
    tokenRef.current += 1;
    update(() => emptyPageState<T>());
  }, [resetKey, update]);

  useEffect(() => {
    if (shouldAutoLoad(state, enabled)) void run('first');
  }, [state, enabled, run]);

  return {
    state,
    refresh: useCallback(() => run('refresh'), [run]),
    loadMore: useCallback(() => run('more'), [run]),
    retry: useCallback(() => run('first'), [run]),
  };
}
