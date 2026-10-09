import { api } from '@/services/api';

export type MediaFolder = 'meals' | 'posts' | 'profiles' | 'challenges' | 'workouts';

// Extensoes de video aceitas hoje (so a pasta "workouts", ver ALLOWED
// FOLDERS/VIDEO_ALLOWED_FOLDERS no backend) — o resto cai no fallback de
// imagem, mesmo comportamento de antes.
const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
};

function guessMimeType(extension: string): string {
  return MIME_TYPES_BY_EXTENSION[extension] ?? `image/${extension === 'jpg' ? 'jpeg' : extension}`;
}

export interface MediaUploadResult {
  url: string;
  /** Miniatura 320x240 WebP; so para folder='meals' e null se nao foi possivel gerar (ou ausente em servidor antigo). */
  thumb_url: string | null;
}

/**
 * Envia uma imagem (ou, na pasta "workouts", um video) local do dispositivo para o S3 e retorna a URL publica e,
 * para a pasta "meals", a miniatura.
 */
export async function uploadMediaWithThumb(fileUri: string, folder: MediaFolder): Promise<MediaUploadResult> {
  const filename = fileUri.split('/').pop() ?? `${folder}.jpg`;
  const extensionMatch = /\.(\w+)$/.exec(filename);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg';
  const mimeType = guessMimeType(extension);

  const formData = new FormData();
  // React Native aceita esse formato de objeto para representar um arquivo local em FormData.
  formData.append('file', {
    uri: fileUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);
  formData.append('folder', folder);

  // Video pode ser bem maior que uma foto — folga maior de timeout so
  // pra essa pasta, sem penalizar os uploads de imagem existentes.
  const timeout = folder === 'workouts' ? 90000 : 30000;
  const response = await api.post<{ url: string; thumb_url?: string | null }>('/media/upload', formData, { timeout });
  return { url: response.data.url, thumb_url: response.data.thumb_url ?? null };
}

/** Envia a midia e retorna so a URL publica (os demais chamadores nao precisam da miniatura). */
export async function uploadMedia(fileUri: string, folder: MediaFolder): Promise<string> {
  return (await uploadMediaWithThumb(fileUri, folder)).url;
}
