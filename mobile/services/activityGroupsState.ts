// Historico de atividades agrupado por mes (aba "Historico" do perfil proprio): logica PURA (sem React Native, sem rede), testada no Node
// (Claude outputs/try_atividades_grupos_app.mjs). Nada e apagado nem escondido: o mes so fica RECOLHIDO (os itens continuam na lista e voltam ao abrir).
// Servidor: GET /users/me/activities devolve paginas por cursor (20 por pagina, mais recentes primeiro) e NAO informa o total; por isso a contagem
// do mes mais antigo carregado pode estar incompleta enquanto houver mais paginas (a tela mostra "N+" e o total como "carregadas").
import type { HistoryItem } from '@/services/profileFeedState';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const UNDATED_KEY = 'sem-data';

/** O servidor manda o instante em UTC SEM fuso na string; aqui vira um Date correto (mesma regra de parseServerDate em profileFeedState). */
function parseWhen(iso: unknown): Date | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026-10" no mes LOCAL do aparelho (nao UTC): 22:30 locais de 31/10 (01:30 UTC de 01/11) continua sendo outubro. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** "Outubro de 2026". Chave invalida ou "sem-data" = "Sem data". */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return 'Sem data';
  const month = Number(m[2]);
  if (month < 1 || month > 12) return 'Sem data';
  return `${MONTH_NAMES[month - 1]} de ${m[1]}`;
}

/** Chave do mes anterior ao da chave dada ("2026-01" -> "2025-12"). */
export function previousMonthKey(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo === 1 ? `${y - 1}-12` : `${y}-${pad2(mo - 1)}`;
}

// ------------------------------------------------------------------------------------------------------------------ grupos
export interface HistoryMonthGroup {
  key: string;
  label: string;
  /** Do mais recente para o mais antigo. */
  items: HistoryItem[];
  /** Mes atual e mes anterior comecam abertos; os mais antigos (e "sem data") recolhidos. */
  defaultOpen: boolean;
}

/**
 * Agrupa por mes local, do mes mais recente para o mais antigo; dentro do mes, do mais recente para o mais antigo. Item sem data valida vai para
 * "Sem data" no fim (nao some). Nenhum item e perdido: a soma dos grupos e sempre o total da lista.
 */
export function groupHistoryByMonth(items: readonly HistoryItem[], now: Date = new Date()): HistoryMonthGroup[] {
  const currentKey = monthKeyOf(now);
  const prevKey = previousMonthKey(currentKey);
  const byMonth = new Map<string, { item: HistoryItem; at: number }[]>();
  const undated: HistoryItem[] = [];
  for (const item of items) {
    const when = parseWhen(item?.occurred_at);
    if (!when) {
      undated.push(item);
      continue;
    }
    const key = monthKeyOf(when);
    const list = byMonth.get(key) ?? [];
    list.push({ item, at: when.getTime() });
    byMonth.set(key, list);
  }
  const groups: HistoryMonthGroup[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, list]) => ({
      key,
      label: monthLabel(key),
      items: list.sort((x, y) => y.at - x.at).map((e) => e.item),
      defaultOpen: key === currentKey || key === prevKey,
    }));
  if (undated.length > 0) groups.push({ key: UNDATED_KEY, label: monthLabel(UNDATED_KEY), items: undated, defaultOpen: false });
  return groups;
}

// ------------------------------------------------------------------------------------------------------- textos e resumo
const NOUNS: Record<string, [string, string]> = {
  all: ['atividade', 'atividades'],
  workout: ['treino', 'treinos'],
  run: ['corrida', 'corridas'],
  bike: ['pedalada', 'pedaladas'],
  walk: ['caminhada', 'caminhadas'],
  swim: ['natação', 'natações'],
  fight: ['luta', 'lutas'],
  hiit: ['HIIT', 'HIIT'],
  other: ['atividade', 'atividades'],
};

function noun(filterKey: string, n: number): string {
  const pair = NOUNS[filterKey] ?? NOUNS.all;
  return n === 1 ? pair[0] : pair[1];
}

/** "12 treinos" / "1 corrida"; com `incomplete` (ha mais paginas e este e o mes mais antigo carregado): "12+ treinos". Respeita o filtro ativo. */
export function monthCountText(count: number, filterKey: string, incomplete = false): string {
  return `${count}${incomplete ? '+' : ''} ${noun(filterKey, incomplete ? 2 : count)}`;
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * Resumo extra do mes SO com dado real: distancia total apenas para Corrida e Pedalada (soma so dos itens que trouxeram distancia).
 * Sem distancia nos itens, outro filtro ou "Tudo" = null (nada inventado).
 */
export function monthSummary(items: readonly HistoryItem[], filterKey: string): string | null {
  if (filterKey !== 'run' && filterKey !== 'bike') return null;
  let total = 0;
  for (const item of items) {
    const d = item?.distance_meters;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) total += d;
  }
  return total > 0 ? formatKm(total) : null;
}

/** "142 atividades" (ou, havendo mais paginas ainda nao carregadas, "142 atividades carregadas"). Sem itens = null. */
export function historyTotalText(count: number, hasMore: boolean, filterKey = 'all'): string | null {
  if (!(count > 0)) return null;
  return `${count} ${noun(filterKey, count)}${hasMore ? ' carregadas' : ''}`;
}

// ------------------------------------------------------------------------------------------------------------ linhas da lista
export interface MonthHeaderRow {
  kind: 'header';
  key: string;
  monthKey: string;
  label: string;
  countText: string;
  summary: string | null;
  open: boolean;
  count: number;
}

export interface MonthItemRow {
  kind: 'item';
  key: string;
  item: HistoryItem;
}

export type HistoryListRow = MonthHeaderRow | MonthItemRow;

/** Estado de abrir/fechar escolhido pela pessoa; o que nao esta aqui segue o padrao do grupo (mes atual e anterior abertos). */
export type OpenOverrides = Record<string, boolean>;

export function isMonthOpen(group: Pick<HistoryMonthGroup, 'key' | 'defaultOpen'>, overrides: OpenOverrides): boolean {
  const chosen = overrides[group.key];
  return typeof chosen === 'boolean' ? chosen : group.defaultOpen;
}

/** Abre/fecha um mes (devolve novos overrides; nao muda o objeto recebido). */
export function toggleMonth(overrides: OpenOverrides, group: Pick<HistoryMonthGroup, 'key' | 'defaultOpen'>): OpenOverrides {
  return { ...overrides, [group.key]: !isMonthOpen(group, overrides) };
}

/**
 * Lista achatada para a FlatList (virtualizada): um cabecalho por mes e, so se o mes esta ABERTO, as linhas dele. Recolher nao remove nada dos
 * dados, so das linhas desenhadas. Com mais paginas por vir, o mes mais antigo carregado pode estar incompleto (contagem "N+").
 */
export function buildHistoryRows(groups: readonly HistoryMonthGroup[], overrides: OpenOverrides, filterKey: string, hasMore: boolean): HistoryListRow[] {
  const rows: HistoryListRow[] = [];
  groups.forEach((group, index) => {
    const open = isMonthOpen(group, overrides);
    const incomplete = hasMore && index === groups.length - 1 && group.key !== UNDATED_KEY;
    rows.push({
      kind: 'header',
      key: `month-${group.key}`,
      monthKey: group.key,
      label: group.label,
      countText: monthCountText(group.items.length, filterKey, incomplete),
      summary: monthSummary(group.items, filterKey),
      open,
      count: group.items.length,
    });
    if (open) for (const item of group.items) rows.push({ kind: 'item', key: item.id, item });
  });
  return rows;
}

/**
 * Carregar mais paginas SOZINHO enquanto o mes atual e o anterior (que comecam abertos) ainda podem estar incompletos: ou seja, ha mais paginas e
 * o item mais antigo carregado ainda e do mes anterior ou de um mais novo. Depois disso, meses antigos so carregam sob pedido (botao no fim da lista).
 */
export function shouldAutoLoadMore(items: readonly HistoryItem[], hasMore: boolean, now: Date = new Date()): boolean {
  if (!hasMore) return false;
  if (items.length === 0) return true;
  const limit = previousMonthKey(monthKeyOf(now));
  let oldest: string | null = null;
  for (const item of items) {
    const when = parseWhen(item?.occurred_at);
    if (!when) continue;
    const key = monthKeyOf(when);
    if (oldest === null || key < oldest) oldest = key;
  }
  return oldest === null ? false : oldest >= limit;
}
