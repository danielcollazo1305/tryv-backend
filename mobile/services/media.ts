import { api } from '@/services/api';

export type MediaFolder = 'meals' | 'posts' | 'profiles';

/** Envia uma imagem local (URI do dispositivo) para o S3 e retorna a URL publica. */
export async function uploadMedia(fileUri: string, folder: MediaFolder): Promise<string> {
  const filename = fileUri.split('/').pop() ?? `${folder}.jpg`;
  const extensionMatch = /\.(\w+)$/.exec(filename);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg';
  const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  const formData = new FormData();
  // React Native aceita esse formato de objeto para representar um arquivo local em FormData.
  formData.append('file', {
    uri: fileUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);
  formData.append('folder', folder);

  const response = await api.post<{ url: string }>('/media/upload', formData, { timeout: 30000 });
  return response.data.url;
}
