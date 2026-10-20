// Abas do SEU perfil (Historico, Galeria, Progresso, Conquistas): logica PURA (sem React, sem rede e sem imports de runtime), testada
// no Node (Claude outputs/try_perfil_abas_app.mjs). Aqui: estado de uma lista paginada por cursor (juntar paginas sem duplicar, saber se ha
// mais, carregar so quando a aba abre), rotulos das linhas do historico (tipo/titulo, data, duracao, distancia, calorias), para onde cada item
// leva e o link do perfil (so https).
//
// Contrato do servidor (backend/app/routers/activity_history.py e gallery.py): { items, next_cursor }; next_cursor e opaco (null = acabou) e
// NUNCA e montado nem interpretado pelo app.

// ------------------------------------------------------------------------------------------------------------------ tipos
export type HistoryKind = 'run' | 'workout' | 'manual';

export interface HistoryItem {
  id: string;
  kind: HistoryKind;
  activity_type: string; // 'run' | 'bike' | 'swim' | 'fight' | 'walk' | 'hiit' | 'other' | 'workout'
  title: string; // rotulo em portugues do servidor (ex.: "Corrida")
  fight_style?: string | null;
  occurred_at: string; // UTC sem fuso na string (ex.: 2026-10-19T14:30:00)
  duration_seconds?: number | null;
  distance_meters?: number | null;
  calories_burned?: number | null;
}

export interface GalleryItem {
  post_id: string;
  url: string;
  created_at: string;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

// ------------------------------------------------------------------------------------------------------ abas do perfil
export type ProfileTab = 'history' | 'gallery' | 'progress' | 'achievements';

export const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
  { key: 'history', label: 'Histórico' },
  { key: 'gallery', label: 'Galeria' },
  { key: 'progress', label: 'Progresso' },
  { key: 'achievements', label: 'Conquistas' },
];

/** Cada aba so busca dados na 1a vez que abre; depois guarda o resultado (trocar de aba nao refaz a chamada). */
export function markVisited(visited: Record<ProfileTab, boolean>, tab: ProfileTab): Record<ProfileTab, boolean> {
  return visited[tab] ? visited : { ...visited, [tab]: true };
}

export const INITIAL_VISITED: Record<ProfileTab, boolean> = { history: true, gallery: false, progress: false, achievements: false };

// ------------------------------------------------------------------------------------------------- lista paginada
export interface PageState<T> {
  items: T[];
  /** Ja carregou a 1a pagina ao menos uma vez com sucesso. */
  loaded: boolean;
  loading: boolean; // 1a pagina
  refreshing: boolean; // puxar para atualizar
  loadingMore: boolean;
  error: boolean;
  nextCursor: string | null;
  hasMore: boolean;
}

export function emptyPageState<T>(): PageState<T> {
  return { items: [], loaded: false, loading: false, refreshing: false, loadingMore: false, error: false, nextCursor: null, hasMore: false };
}

/** Acrescenta itens sem repetir ids que ja estao na lista (defesa extra; o cursor do servidor ja evita repeticao). */
export function mergeById<T>(prev: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(prev.map(keyOf));
  const fresh: T[] = [];
  for (const item of incoming) {
    const key = keyOf(item);
    if (!seen.has(key)) {
      seen.add(key);
      fresh.push(item);
    }
  }
  return fresh.length === 0 ? prev : [...prev, ...fresh];
}

export type LoadMode = 'first' | 'refresh' | 'more';

export function startLoading<T>(state: PageState<T>, mode: LoadMode): PageState<T> {
  if (mode === 'first') return { ...state, loading: true, error: false };
  if (mode === 'refresh') return { ...state, refreshing: true, error: false };
  return { ...state, loadingMore: true };
}

/** Pedido da pagina: recarregar do topo (reset) NAO envia cursor; a proxima pagina envia exatamente o cursor guardado. */
export function buildCursorRequest<T>(state: PageState<T>, reset: boolean): { cursor?: string } {
  return reset || !state.nextCursor ? {} : { cursor: state.nextCursor };
}

/** Aplica uma pagina recebida. reset = substitui a lista (1a pagina / puxar para atualizar); senao acrescenta sem duplicar. */
export function applyPageResult<T>(state: PageState<T>, page: CursorPage<T>, reset: boolean, keyOf: (item: T) => string): PageState<T> {
  const items = reset ? mergeById([], page.items, keyOf) : mergeById(state.items, page.items, keyOf);
  const nextCursor = typeof page.next_cursor === 'string' && page.next_cursor.length > 0 ? page.next_cursor : null;
  return { items, loaded: true, loading: false, refreshing: false, loadingMore: false, error: false, nextCursor, hasMore: nextCursor !== null };
}

/** Falha: erro na 1a pagina mostra "tentar de novo"; falha ao carregar mais ou ao atualizar mantem o que ja esta na tela (sem erro de tela). */
export function applyPageError<T>(state: PageState<T>, mode: LoadMode): PageState<T> {
  if (mode === 'first') return { ...state, loading: false, error: true };
  if (mode === 'refresh') return { ...state, refreshing: false, error: state.loaded ? false : true };
  return { ...state, loadingMore: false };
}

export function canLoadMore<T>(state: PageState<T>): boolean {
  return state.loaded && state.hasMore && !state.loading && !state.refreshing && !state.loadingMore && !state.error;
}

/** A aba deve buscar a 1a pagina sozinha? So quando esta aberta (habilitada), ainda nao carregou e nao ha busca nem erro pendente. */
export function shouldAutoLoad<T>(state: PageState<T>, enabled: boolean): boolean {
  return enabled && !state.loaded && !state.loading && !state.error;
}

// ---------------------------------------------------------------------------------------------------- filtros do historico
export interface HistoryFilter {
  key: string;
  label: string;
  /** Valor do parametro `type` do servidor; undefined = todos. */
  type?: string;
}

// Valores aceitos pelo servidor em /users/me/activities?type= (activity_history.py: HistoryType).
export const HISTORY_FILTERS: HistoryFilter[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'workout', label: 'Treinos', type: 'workout' },
  { key: 'run', label: 'Corrida', type: 'run' },
  { key: 'bike', label: 'Pedalada', type: 'bike' },
  { key: 'walk', label: 'Caminhada', type: 'walk' },
  { key: 'swim', label: 'Natação', type: 'swim' },
  { key: 'fight', label: 'Luta', type: 'fight' },
  { key: 'hiit', label: 'HIIT', type: 'hiit' },
  { key: 'other', label: 'Outras', type: 'other' },
];

// ------------------------------------------------------------------------------------------------ rotulos do historico
export function formatDurationLabel(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

export function formatDistanceLabel(meters: number | null | undefined): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

export function formatCaloriesLabel(kcal: number | null | undefined): string | null {
  if (typeof kcal !== 'number' || !Number.isFinite(kcal) || kcal <= 0) return null;
  return `${Math.round(kcal)} kcal`;
}

/** "5,00 km • 30 min • 300 kcal" (so o que o servidor devolveu); null se nao ha nada a mostrar. */
export function historyMetricsLine(item: HistoryItem): string | null {
  const parts = [formatDistanceLabel(item.distance_meters), formatDurationLabel(item.duration_seconds), formatCaloriesLabel(item.calories_burned)].filter(
    (p): p is string => p !== null
  );
  return parts.length > 0 ? parts.join(' • ') : null;
}

/** O servidor manda o instante em UTC SEM fuso na string; aqui vira um Date correto (sem isso o JS leria como hora local). */
export function parseServerDate(iso: string): Date | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Hoje, 14:30" / "Ontem, 09:10" / "12/10/2026" (hora local do aparelho). */
export function formatOccurredAt(iso: string, now: Date = new Date()): string {
  const d = parseServerDate(iso);
  if (!d) return '';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (diffDays === 0) return `Hoje, ${time}`;
  if (diffDays === 1) return `Ontem, ${time}`;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const FIGHT_STYLE_LABELS: Record<string, string> = {
  boxe: 'Boxe', muay_thai: 'Muay thai', jiu_jitsu: 'Jiu-jitsu', mma: 'MMA', judo: 'Judô', karate: 'Karatê', outra: 'Outra',
};

export interface HistoryRowLabels {
  title: string;
  subtitle: string; // data + (estilo de luta)
  metrics: string | null;
  /** Texto unico para o leitor de tela. */
  spoken: string;
}

export function historyRowLabels(item: HistoryItem, now: Date = new Date()): HistoryRowLabels {
  const style = item.fight_style ? FIGHT_STYLE_LABELS[item.fight_style] ?? null : null;
  const title = style ? `${item.title} (${style})` : item.title;
  const subtitle = formatOccurredAt(item.occurred_at, now);
  const metrics = historyMetricsLine(item);
  return { title, subtitle, metrics, spoken: [title, subtitle, metrics].filter(Boolean).join('. ') };
}

/** Para onde o toque leva: corrida e atividade manual ja tem tela de detalhe (/activity/[id]); treino NAO tem (nao navega). */
export function historyNavTarget(item: HistoryItem): { pathname: '/activity/[id]'; params: { id: string; kind: 'run' | 'manual' } } | null {
  if (item.kind === 'run' || item.kind === 'manual') return { pathname: '/activity/[id]', params: { id: item.id, kind: item.kind } };
  return null;
}

// ------------------------------------------------------------------------------------------------------------ link
/** Link do perfil que PODE ser aberto no navegador: so https, sem usuario:senha e sem espacos; senao null (nao vira botao). */
export function openableLink(link: string | null | undefined): string | null {
  if (typeof link !== 'string') return null;
  const value = link.trim();
  if (!/^https:\/\//i.test(value) || /\s/.test(value)) return null;
  const authority = value.slice('https://'.length).split(/[/?#]/)[0] ?? '';
  if (authority === '' || authority.includes('@') || !authority.includes('.')) return null;
  return value;
}

/** Texto do link sem "https://" e sem a barra final (mais curto para mostrar). */
export function linkDisplayText(link: string): string {
  return link.replace(/^https:\/\//i, '').replace(/\/$/, '');
}
