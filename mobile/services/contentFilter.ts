/**
 * Respostas do filtro de conteudo do backend (E3e), vistas pelo app. Arquivo SEM imports de proposito: e puro e roda em Node
 * (os testes ficam em Claude outputs/). O erro do axios e reconhecido pela forma (`response.status/headers/data`), sem
 * importar o axios.
 *
 * Contrato (backend/app/services/content_filter_guard.py):
 *   - texto bloqueado: HTTP 422, cabecalho `X-Content-Filter: text`, `detail` em TEXTO (a mensagem a mostrar);
 *   - pausa por excesso de bloqueios: HTTP 429, `Retry-After` e o mesmo cabecalho, `detail` em texto.
 * O app NAO escreve as mensagens do servidor: mostra o `detail`. A decisao de "e do filtro?" vem do CABECALHO, nunca do
 * texto da mensagem. Texto grande demais (422 sem o cabecalho) e um erro comum e segue o tratamento normal (getApiErrorMessage).
 *
 * FOTOS (E3e fase 5; backend POST /media/upload, pasta posts): foto reprovada = 422 com `X-Content-Filter: image`; analise
 * indisponivel = 503; arquivo ilegivel = 400; limite de 20 fotos/hora = 429 (sem cabecalho) ou pausa por bloqueios = 429 com o
 * cabecalho (`text` ou `image`). `isContentFilterError` e SO do TEXTO (valor `text`): foto reprovada NAO e confundida com texto
 * barrado (usa `isImageFilterError`/`classifyImageUploadError`). A pausa (`isContentFilterPause`) vale para os dois tipos.
 */

export const CONTENT_FILTER_HEADER = 'x-content-filter';

/** So aparece se o servidor responder com o cabecalho mas sem `detail` em texto (nao deve acontecer). */
export const FALLBACK_FILTER_MESSAGE = 'Seu texto não foi aceito. Revise e tente de novo.';

interface AxiosLikeError {
  response?: { status?: number; data?: unknown; headers?: unknown };
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const bag = headers as Record<string, unknown> & { get?: (headerName: string) => unknown };
  if (typeof bag.get === 'function') {
    const viaGet = bag.get(name); // AxiosHeaders#get ignora maiusculas/minusculas
    if (viaGet !== undefined && viaGet !== null) return String(viaGet);
  }
  for (const key of Object.keys(bag)) {
    if (key.toLowerCase() === name) {
      const value = bag[key];
      if (value !== undefined && value !== null && typeof value !== 'function') return String(value);
    }
  }
  return undefined;
}

function responseOf(err: unknown): AxiosLikeError['response'] | undefined {
  return (err as AxiosLikeError | null | undefined)?.response;
}

function filterHeaderValue(err: unknown): string {
  return (readHeader(responseOf(err)?.headers, CONTENT_FILTER_HEADER) ?? '').trim().toLowerCase();
}

function hasFilterHeader(err: unknown): boolean {
  return filterHeaderValue(err) !== '';
}

/** Status HTTP da resposta de um erro do axios (ou undefined: erro de rede, nao-axios...). */
export function getHttpStatus(err: unknown): number | undefined {
  const status = responseOf(err)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Texto barrado pelo filtro: 422 com `X-Content-Filter: text`. Foto reprovada (`image`) NAO entra aqui. */
export function isContentFilterError(err: unknown): boolean {
  return getHttpStatus(err) === 422 && filterHeaderValue(err) === 'text';
}

/** Pausa por excesso de bloqueios (texto OU foto): 429 com o cabecalho do filtro. */
export function isContentFilterPause(err: unknown): boolean {
  return getHttpStatus(err) === 429 && hasFilterHeader(err);
}

/** Foto reprovada pela analise automatica: 422 com `X-Content-Filter: image`. */
export function isImageFilterError(err: unknown): boolean {
  return getHttpStatus(err) === 422 && filterHeaderValue(err) === 'image';
}

/** Analise da foto indisponivel agora (falha fechada do servidor): 503 num upload de foto. */
export function isImageUnavailable(err: unknown): boolean {
  return getHttpStatus(err) === 503;
}

/** Arquivo que o servidor nao conseguiu ler como imagem: 400 num upload de foto. */
export function isUnreadableImage(err: unknown): boolean {
  return getHttpStatus(err) === 400;
}

/** Mensagem do servidor quando o erro e do filtro (bloqueio ou pausa); `null` para qualquer outro erro. */
export function getContentFilterMessage(err: unknown): string | null {
  if (!isContentFilterError(err) && !isContentFilterPause(err)) return null;
  const detail = (responseOf(err)?.data as { detail?: unknown } | null | undefined)?.detail;
  return typeof detail === 'string' && detail.trim() !== '' ? detail : FALLBACK_FILTER_MESSAGE;
}

export type ImageUploadErrorKind = 'rejected' | 'unavailable' | 'unreadable' | 'limited';

export interface ImageUploadError {
  kind: ImageUploadErrorKind;
  message: string;
}

/** So se o servidor responder com status certo mas SEM `detail` em texto (nao deve acontecer); o app nao escreve as mensagens do servidor. */
export const IMAGE_FALLBACK_MESSAGES: Record<ImageUploadErrorKind, string> = {
  rejected: 'Esta foto não foi aceita. Escolha outra.',
  unavailable: 'Não foi possível verificar a foto agora. Tente de novo em instantes.',
  unreadable: 'Não foi possível ler a foto. Escolha outra.',
  limited: 'Muitos envios em pouco tempo. Tente novamente mais tarde.',
};

/**
 * Classifica o erro de um UPLOAD de foto de post: 'rejected' (422 image: descartar a foto), 'unavailable' (503: manter a foto e
 * deixar tentar de novo), 'unreadable' (400: escolher outra), 'limited' (429: mostrar o tempo). `null` para qualquer outro erro
 * (rede, 500...), que segue o tratamento comum. A mensagem e o `detail` do servidor (texto); nunca escrita aqui.
 */
export function classifyImageUploadError(err: unknown): ImageUploadError | null {
  let kind: ImageUploadErrorKind;
  if (isImageFilterError(err)) kind = 'rejected';
  else if (isImageUnavailable(err)) kind = 'unavailable';
  else if (isUnreadableImage(err)) kind = 'unreadable';
  else if (getHttpStatus(err) === 429) kind = 'limited';
  else return null;
  const detail = (responseOf(err)?.data as { detail?: unknown } | null | undefined)?.detail;
  return { kind, message: typeof detail === 'string' && detail.trim() !== '' ? detail : IMAGE_FALLBACK_MESSAGES[kind] };
}

/**
 * Mensagem para avisar que o COMPARTILHAMENTO no feed (refeicao/check-in, que ja foram salvos) falhou por causa do filtro:
 * foto (reprovada, indisponivel, ilegivel, limite) ou texto (bloqueio, pausa). `null` = erro comum (segue silencioso como antes).
 */
export function getShareFailureMessage(err: unknown): string | null {
  return classifyImageUploadError(err)?.message ?? getContentFilterMessage(err);
}

/**
 * Erro com a mensagem JA pronta para mostrar e as marcas do filtro. Usado no cadastro (AuthContext.register), que antes
 * convertia tudo em `Error(mensagem)` e perdia o cabecalho. Continua sendo `instanceof Error` (o codigo que le `.message` nao muda).
 */
export class ApiMessageError extends Error {
  contentFilter: boolean;
  pause: boolean;

  constructor(message: string, flags: { contentFilter?: boolean; pause?: boolean } = {}) {
    super(message);
    Object.setPrototypeOf(this, ApiMessageError.prototype);
    this.name = 'ApiMessageError';
    this.contentFilter = !!flags.contentFilter;
    this.pause = !!flags.pause;
  }
}
