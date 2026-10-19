// Editar o PROPRIO post (legenda e privacidade). Tudo aqui e PURO (sem React, sem rede e sem imports de runtime) para ser testado
// no Node (Claude outputs/try_editar_post_app.mjs): opcoes do menu "...", regra do botao Salvar, toque na privacidade ja marcada,
// traducao dos erros do PATCH /posts/{id} e troca do post nas listas.
import type { Post } from '@/services/social';

export type PostVisibilityChoice = 'public' | 'followers';

// ---------------------------------------------------------------------------------------------------------- menu "..."
export type MenuKind = 'post' | 'comment';
export type MenuActionKey = 'edit_caption' | 'edit_visibility' | 'delete' | 'report' | 'block' | 'cancel';

export interface MenuOption {
  key: MenuActionKey;
  label: string;
  style?: 'default' | 'destructive' | 'cancel';
  accessibilityLabel: string;
}

export interface MenuInput {
  kind: MenuKind;
  isOwn: boolean;
  authorName: string;
  /** Tela sabe trocar o post na lista depois de editar (passa onPostUpdated) = oferece Editar legenda e Mudar privacidade. */
  canEdit: boolean;
  /** Tela sabe excluir o post (passa onDeletePost) = oferece Excluir. */
  canDelete: boolean;
}

export const MENU_LABELS = {
  editCaption: 'Editar legenda',
  editVisibility: 'Mudar privacidade',
  delete: 'Excluir',
  report: 'Denunciar',
  cancel: 'Cancelar',
} as const;

/** Titulo do menu (Alert): mesmo texto de antes para posts/comentarios de outras pessoas e para o post proprio. */
export function menuTitle(kind: MenuKind, isOwn: boolean): string {
  if (isOwn) return 'Seu post';
  return kind === 'post' ? 'Opções do post' : 'Opções do comentário';
}

/**
 * Opcoes do menu "...". Post PROPRIO: Editar legenda, Mudar privacidade, Excluir e Cancelar (cada uma so se a tela souber fazer;
 * sem nenhuma, nao ha menu = lista vazia). Comentario proprio: sem menu. Conteudo de OUTRA pessoa: Denunciar, Bloquear <nome>
 * e Cancelar, exatamente como antes.
 */
export function buildMenuOptions({ kind, isOwn, authorName, canEdit, canDelete }: MenuInput): MenuOption[] {
  if (isOwn) {
    if (kind !== 'post') return [];
    const options: MenuOption[] = [];
    if (canEdit) {
      options.push({ key: 'edit_caption', label: MENU_LABELS.editCaption, accessibilityLabel: 'Editar a legenda do post' });
      options.push({ key: 'edit_visibility', label: MENU_LABELS.editVisibility, accessibilityLabel: 'Mudar quem pode ver o post' });
    }
    if (canDelete) {
      options.push({ key: 'delete', label: MENU_LABELS.delete, style: 'destructive', accessibilityLabel: 'Excluir o post' });
    }
    if (options.length === 0) return [];
    options.push({ key: 'cancel', label: MENU_LABELS.cancel, style: 'cancel', accessibilityLabel: 'Cancelar' });
    return options;
  }
  return [
    { key: 'report', label: MENU_LABELS.report, accessibilityLabel: kind === 'post' ? 'Denunciar o post' : 'Denunciar o comentário' },
    { key: 'block', label: `Bloquear ${authorName}`, style: 'destructive', accessibilityLabel: `Bloquear ${authorName}` },
    { key: 'cancel', label: MENU_LABELS.cancel, style: 'cancel', accessibilityLabel: 'Cancelar' },
  ];
}

// ------------------------------------------------------------------------------------------------------ editar legenda
export interface CaptionEditState {
  /** Salvar so liga quando o texto mudou, cabe no limite e nao ha envio em andamento. */
  canSave: boolean;
  changed: boolean;
  tooLong: boolean;
  length: number;
}

/** Texto como o servidor grava: espacos nas pontas saem; vazio = sem legenda. */
export function normalizeCaption(text: string | null | undefined): string {
  return (text ?? '').trim();
}

export function captionEditState(original: string | null | undefined, draft: string, saving: boolean, max: number): CaptionEditState {
  const changed = normalizeCaption(draft) !== normalizeCaption(original);
  const tooLong = normalizeCaption(draft).length > max;
  return { canSave: changed && !tooLong && !saving, changed, tooLong, length: draft.length };
}

// -------------------------------------------------------------------------------------------------------- privacidade
export const VISIBILITY_OPTIONS: { value: PostVisibilityChoice; label: string; description: string }[] = [
  { value: 'public', label: 'Público', description: 'Qualquer pessoa pode ver.' },
  { value: 'followers', label: 'Seguidores', description: 'Só quem te segue.' },
];

/** Tocar na opcao ja marcada so fecha a folha (nao chama a API); tocar na outra chama a API. */
export function visibilityTapAction(current: string, tapped: PostVisibilityChoice): 'close' | 'update' {
  return current === tapped ? 'close' : 'update';
}

// -------------------------------------------------------------------------------------------------------------- erros
export type PostEditErrorKind = 'content_filter' | 'invalid' | 'unauthorized' | 'forbidden' | 'unavailable' | 'network' | 'unknown';

export interface PostEditError {
  kind: PostEditErrorKind;
  message: string;
}

export const POST_EDIT_MESSAGES = {
  invalid: 'Não foi possível salvar. Confira o texto e tente novamente.',
  tooLong: (max: number) => `O texto é longo demais (máximo de ${max} caracteres).`,
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  forbidden: 'Você só pode editar os seus próprios posts.',
  // 404 (post nao existe/nao e visivel) e 405 (servidor antigo sem a rota nova): nunca falso sucesso, nunca trava a tela.
  unavailable: 'Não foi possível salvar agora. Tente novamente mais tarde.',
  network: 'Sem conexão. Verifique a internet e tente de novo.',
  unknown: 'Não foi possível salvar agora. Tente novamente mais tarde.',
} as const;

function statusOf(err: unknown): number | undefined {
  const status = (err as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function hasResponse(err: unknown): boolean {
  return !!(err as { response?: unknown } | null | undefined)?.response;
}

/**
 * Traduz o erro do PATCH /posts/{id}. `filterMessage` = getContentFilterMessage(err) de services/contentFilter.ts (texto proibido
 * 422 + cabecalho do filtro, ou pausa 429): mostra a mesma mensagem que a tela de novo post mostra. `draftLength`/`max`: se o texto
 * passa do limite e o servidor respondeu 422, mostra a mensagem de texto longo.
 */
export function classifyPostEditError(err: unknown, filterMessage: string | null, draftLength = 0, max = Infinity): PostEditError {
  if (filterMessage) return { kind: 'content_filter', message: filterMessage };
  const status = statusOf(err);
  if (status === 422) {
    return { kind: 'invalid', message: draftLength > max ? POST_EDIT_MESSAGES.tooLong(max) : POST_EDIT_MESSAGES.invalid };
  }
  if (status === 401) return { kind: 'unauthorized', message: POST_EDIT_MESSAGES.unauthorized };
  if (status === 403) return { kind: 'forbidden', message: POST_EDIT_MESSAGES.forbidden };
  if (status === 404 || status === 405) return { kind: 'unavailable', message: POST_EDIT_MESSAGES.unavailable };
  if (!hasResponse(err)) return { kind: 'network', message: POST_EDIT_MESSAGES.network };
  return { kind: 'unknown', message: POST_EDIT_MESSAGES.unknown };
}

// ----------------------------------------------------------------------------------------------------- troca na lista
/** Troca o post (mesmo id) pelo devolvido pelo servidor, mantendo a posicao. Lista sem esse post = a mesma lista. */
export function replacePostInList(posts: Post[], updated: Post): Post[] {
  if (!posts.some((p) => p.id === updated.id)) return posts;
  return posts.map((p) => (p.id === updated.id ? updated : p));
}
