import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

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

/**
 * Chave do token no SecureStore. Mora aqui (e nao no AuthContext, que era o
 * dono original) porque quem le/escreve isso deixou de ser so o React: a
 * importacao automatica de treinos roda fora de qualquer componente, as vezes
 * com o app acordado em segundo plano pelo sistema, e precisa da MESMA chave —
 * duplicar a string em dois arquivos e o tipo de coisa que quebra silenciosa
 * meses depois, quando um dos dois muda.
 */
export const AUTH_TOKEN_STORAGE_KEY = 'tryv_auth_token';

// O token e mantido aqui em memoria (fora do React) para que o interceptor
// abaixo funcione de forma sincrona; quem controla o valor e o AuthContext.
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/**
 * Garante que ha um token em memoria antes de uma chamada de API feita FORA
 * do ciclo de vida do React (importacao automatica de treinos, gatilho de
 * segundo plano). No fluxo normal o AuthContext ja preencheu isso ao montar;
 * quando o sistema acorda o app so pra entregar um treino, nao ha garantia
 * nenhuma de que algum componente montou — sem isto, as chamadas sairiam sem
 * Authorization e falhariam com 401 em silencio.
 *
 * Devolve null quando nao ha sessao salva (usuario deslogado) — o chamador
 * deve simplesmente desistir, sem tratar como erro.
 *
 * Sobre o aparelho bloqueado: o SecureStore usa, por padrao, uma classe de
 * acesso do Keychain que exige o aparelho ja ter sido desbloqueado ao menos
 * uma vez desde o boot. Isso casa com a regra do proprio iOS pra entrega de
 * HealthKit em segundo plano (que tambem so acontece com o aparelho
 * desbloqueado), entao na pratica os dois caminhos coincidem — nao ha cenario
 * util em que o app acorda pra importar e o token esta inacessivel.
 */
export async function ensureAuthToken(): Promise<string | null> {
  if (authToken) return authToken;
  try {
    const stored = await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
    if (stored) setAuthToken(stored);
    return stored;
  } catch {
    return null;
  }
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
