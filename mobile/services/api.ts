import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  console.warn(
    'EXPO_PUBLIC_API_URL nao esta definida. Configure mobile/.env.local (veja .env.example) ' +
      'com o IP da sua maquina na rede Wi-Fi — o celular fisico nao alcanca "localhost".'
  );
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// O token e mantido aqui em memoria (fora do React) para que o interceptor
// abaixo funcione de forma sincrona; quem controla o valor e o AuthContext.
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

interface ApiErrorPayload {
  detail?: string | { msg: string }[];
}

/** Traduz erros da API (FastAPI) em uma mensagem legivel para o usuario. */
export function getApiErrorMessage(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorPayload | undefined;

    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      return data.detail.map((item) => item.msg).join('\n');
    }
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      return 'Nao foi possivel conectar ao servidor. Verifique sua conexao e o IP configurado.';
    }
  }
  return fallback;
}
