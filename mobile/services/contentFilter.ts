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

function hasFilterHeader(err: unknown): boolean {
  const value = readHeader(responseOf(err)?.headers, CONTENT_FILTER_HEADER);
  return !!value && value.trim() !== '';
}

/** Texto barrado pelo filtro: 422 com o cabecalho do filtro. */
export function isContentFilterError(err: unknown): boolean {
  return responseOf(err)?.status === 422 && hasFilterHeader(err);
}

/** Pausa por excesso de bloqueios: 429 com o cabecalho do filtro. */
export function isContentFilterPause(err: unknown): boolean {
  return responseOf(err)?.status === 429 && hasFilterHeader(err);
}

/** Mensagem do servidor quando o erro e do filtro (bloqueio ou pausa); `null` para qualquer outro erro. */
export function getContentFilterMessage(err: unknown): string | null {
  if (!isContentFilterError(err) && !isContentFilterPause(err)) return null;
  const detail = (responseOf(err)?.data as { detail?: unknown } | null | undefined)?.detail;
  return typeof detail === 'string' && detail.trim() !== '' ? detail : FALLBACK_FILTER_MESSAGE;
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
