// Fotos de um post (carrossel de ate 10): logica PURA (sem React, sem rede), testada no Node (Claude outputs/try_carrossel_app.mjs).
// Servidor: POST /posts aceita media_urls (1 a 10, sem repetir, so type photo) alem de media_url; a capa media_url = media_urls[0].
// Compatibilidade: ao CRIAR, sempre manda media_url (a primeira) junto com media_urls (servidor antigo ignora media_urls e o post nao
// sairia sem foto); ao LER, media_urls ausente = [media_url].

export const MAX_POST_PHOTOS = 10;

export type PhotoStatus = 'pending' | 'uploading' | 'ok' | 'error';
/** 'rejected'/'unreadable': a foto em si nao serve (tentar de novo nao muda nada); 'unavailable'/'limited'/'other': pode valer tentar de novo. */
export type PhotoErrorKind = 'rejected' | 'unreadable' | 'unavailable' | 'limited' | 'other';

export interface PostPhoto {
  /** Identidade da foto na lista: o proprio endereco local (fotos repetidas nao entram). */
  id: string;
  uri: string;
  status: PhotoStatus;
  /** Endereco devolvido pelo servidor depois do envio (so com status 'ok'). */
  url: string | null;
  error: string | null;
  errorKind: PhotoErrorKind | null;
}

// ------------------------------------------------------------------------------------------------------------------ lista
export function newPhoto(uri: string): PostPhoto {
  return { id: uri, uri, status: 'pending', url: null, error: null, errorKind: null };
}

export interface AddResult {
  photos: PostPhoto[];
  added: number;
  duplicates: number;
  overLimit: number;
}

/** Acrescenta fotos ao fim da lista: ignora repetidas (mesma foto ou ja na lista) e o que passar de 10. */
export function addPhotos(photos: PostPhoto[], uris: readonly string[]): AddResult {
  const next = [...photos];
  const seen = new Set(photos.map((p) => p.id));
  let added = 0;
  let duplicates = 0;
  let overLimit = 0;
  for (const raw of uris) {
    const uri = typeof raw === 'string' ? raw.trim() : '';
    if (uri === '') continue;
    if (seen.has(uri)) {
      duplicates += 1;
    } else if (next.length >= MAX_POST_PHOTOS) {
      overLimit += 1;
    } else {
      seen.add(uri);
      next.push(newPhoto(uri));
      added += 1;
    }
  }
  return { photos: next, added, duplicates, overLimit };
}

export function removePhoto(photos: PostPhoto[], id: string): PostPhoto[] {
  return photos.filter((p) => p.id !== id);
}

export function remainingSlots(photos: PostPhoto[]): number {
  return Math.max(0, MAX_POST_PHOTOS - photos.length);
}

/** Contador "N/10". */
export function photoCounterText(photos: PostPhoto[]): string {
  return `${photos.length}/${MAX_POST_PHOTOS}`;
}

/** Aviso depois de escolher fotos (repetidas ignoradas, excesso cortado); null = nada a avisar. */
export function addNotice(result: Pick<AddResult, 'duplicates' | 'overLimit'>): string | null {
  const parts: string[] = [];
  if (result.overLimit > 0) parts.push(`Um post aceita no máximo ${MAX_POST_PHOTOS} fotos.`);
  if (result.duplicates > 0) parts.push(result.duplicates === 1 ? 'Uma foto repetida foi ignorada.' : `${result.duplicates} fotos repetidas foram ignoradas.`);
  return parts.length > 0 ? parts.join(' ') : null;
}

// ----------------------------------------------------------------------------------------------------------------- envio
function update(photos: PostPhoto[], id: string, patch: Partial<PostPhoto>): PostPhoto[] {
  return photos.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

export function markUploading(photos: PostPhoto[], id: string): PostPhoto[] {
  return update(photos, id, { status: 'uploading', error: null, errorKind: null });
}

export function markOk(photos: PostPhoto[], id: string, url: string): PostPhoto[] {
  return update(photos, id, { status: 'ok', url, error: null, errorKind: null });
}

export function markError(photos: PostPhoto[], id: string, message: string, kind: PhotoErrorKind = 'other'): PostPhoto[] {
  return update(photos, id, { status: 'error', url: null, error: message, errorKind: kind });
}

/** "Tentar de novo" so dessa foto: volta a pendente; as outras nao mudam (as ja enviadas nao sobem de novo). */
export function retryPhoto(photos: PostPhoto[], id: string): PostPhoto[] {
  return photos.map((p) => (p.id === id && p.status === 'error' ? { ...p, status: 'pending', error: null, errorKind: null } : p));
}

/** Depois de uma recusa do servidor ao criar o post (ex.: foto nao verificada ou ja usada): descarta os enderecos e reenvia tudo. */
export function resetAllToPending(photos: PostPhoto[]): PostPhoto[] {
  return photos.map((p) => ({ ...p, status: 'pending', url: null, error: null, errorKind: null }));
}

/** Tentar de novo so vale quando o problema nao e a foto em si. */
export function canRetry(photo: PostPhoto): boolean {
  return photo.status === 'error' && photo.errorKind !== 'rejected' && photo.errorKind !== 'unreadable';
}

/** Proxima foto a enviar (a primeira pendente, na ordem da lista); null = nada a enviar. Envio SEMPRE um de cada vez. */
export function nextToUpload(photos: PostPhoto[]): PostPhoto | null {
  return photos.find((p) => p.status === 'pending') ?? null;
}

export function isUploading(photos: PostPhoto[]): boolean {
  return photos.some((p) => p.status === 'uploading');
}

export function hasError(photos: PostPhoto[]): boolean {
  return photos.some((p) => p.status === 'error');
}

export function allOk(photos: PostPhoto[]): boolean {
  return photos.length > 0 && photos.every((p) => p.status === 'ok' && !!p.url);
}

/** "Enviando 2 de 5": a posicao da foto que esta sendo enviada (ou a proxima) entre todas; null = nada em andamento. */
export function uploadProgressText(photos: PostPhoto[]): string | null {
  const total = photos.length;
  if (total === 0) return null;
  const index = photos.findIndex((p) => p.status === 'uploading');
  if (index === -1) return null;
  return `Enviando ${index + 1} de ${total}`;
}

/** Publicar so fica ligado com ao menos 1 foto, nada em envio e sem estar ocupado (evita toque duplo). */
export function canPublish(photos: PostPhoto[], busy: boolean): boolean {
  return !busy && photos.length > 0 && !isUploading(photos);
}

// ---------------------------------------------------------------------------------------------------------------- payload
export interface CreatePostArgs {
  caption?: string | null;
  visibility: 'public' | 'followers';
}

export interface PhotoPostPayload {
  type: 'photo';
  caption?: string;
  media_url: string;
  media_urls?: string[];
  visibility: 'public' | 'followers';
  origin: 'manual';
}

/**
 * Monta o corpo de POST /posts. SO devolve algo se TODAS as fotos estao enviadas (post incompleto nunca e publicado).
 * 1 foto = igual a hoje (so media_url); 2 ou mais = media_url (a primeira) JUNTO com media_urls (todas, em ordem).
 */
export function buildPhotoPostPayload(photos: PostPhoto[], args: CreatePostArgs): PhotoPostPayload | null {
  if (!allOk(photos)) return null;
  const urls = photos.map((p) => p.url as string);
  if (new Set(urls).size !== urls.length) return null;
  const caption = typeof args.caption === 'string' ? args.caption.trim() : '';
  const payload: PhotoPostPayload = {
    type: 'photo',
    media_url: urls[0],
    visibility: args.visibility,
    origin: 'manual',
  };
  if (caption !== '') payload.caption = caption;
  if (urls.length >= 2) payload.media_urls = urls;
  return payload;
}

// ----------------------------------------------------------------------------------------------------------------- leitura
/**
 * Fotos de um post, de forma segura: a capa (media_url) primeiro e depois as demais de media_urls, sem repetir. Servidor antigo (sem
 * media_urls) = [media_url]; sem foto = []. Ignora itens que nao sejam texto.
 */
export function photosOfPost(post: { media_url?: unknown; media_urls?: unknown } | null | undefined): string[] {
  if (!post || typeof post !== 'object') return [];
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string') {
      const v = value.trim();
      if (v !== '' && !out.includes(v)) out.push(v);
    }
  };
  add(post.media_url);
  if (Array.isArray(post.media_urls)) post.media_urls.forEach(add);
  return out;
}

/** Quantas fotos o item da galeria representa (photo_count ausente, invalido ou < 1 = 1). */
export function galleryPhotoCount(item: { photo_count?: unknown } | null | undefined): number {
  const n = item && typeof item === 'object' ? item.photo_count : undefined;
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Texto "N/M" do carrossel (so com 2 ou mais fotos). */
export function carouselCounterText(index: number, total: number): string | null {
  if (total < 2) return null;
  const clamped = Math.min(Math.max(index, 0), total - 1);
  return `${clamped + 1}/${total}`;
}

/** Posicao da foto visivel a partir do deslocamento horizontal e da largura da pagina. */
export function pageIndexFromOffset(offsetX: number, pageWidth: number, total: number): number {
  if (!(pageWidth > 0) || total <= 0) return 0;
  return Math.min(Math.max(Math.round(offsetX / pageWidth), 0), total - 1);
}
