import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { api, AUTH_TOKEN_STORAGE_KEY, getApiErrorMessage, setAuthToken } from '@/services/api';
import { getUserBadges } from '@/services/user';

// Reexportado de services/api.ts — a chave mora la porque a importacao
// automatica de treinos tambem precisa ler o token fora do React (ver
// ensureAuthToken).
const TOKEN_KEY = AUTH_TOKEN_STORAGE_KEY;

// Intervalo minimo entre re-buscas de isPro disparadas pelo retorno do app ao primeiro plano.
const IS_PRO_FOREGROUND_THROTTLE_MS = 60_000;

export interface User {
  id: string;
  name: string;
  email: string;
  weight: number | null;
  height: number | null;
  goal: string | null;
  daily_calorie_goal: number | null;
  daily_protein_goal: number | null;
  date_of_birth: string | null;
  biological_sex: string | null;
  body_fat_percentage: number | null;
  training_level: string | null;
  available_equipment: string | null;
  subscription_status: string;
  created_at: string;
  city: string | null;
  city_ibge_code: number | null;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /**
   * Tryv Pro do usuario logado (GET /users/{id}/badges, buscado no
   * login/boot). `null` = ainda nao se sabe (carregando OU a busca falhou) --
   * NUNCA tratar null como "nao e Pro": uma falha de rede nao pode virar
   * paywall pra quem assina. Quem for bloquear algo deve esperar `false`
   * explicito.
   */
  isPro: boolean | null;
  /**
   * Re-busca isPro manualmente (ex: depois de assinar). Nao lanca: falha mantem o ultimo valor
   * conhecido. Devolve o valor que o SERVIDOR acabou de informar (true/false), ou null se a busca
   * falhou / nao ha sessao -- nesse caso isPro nao foi alterado (nunca vira false por falha de rede).
   */
  refreshIsPro: () => Promise<boolean | null>;
  /**
   * Flag de transicao pro wizard de cadastro: entre o passo que cria a
   * conta (token ja setado, ver register()) e um passo extra opcional
   * depois dele (ex: register-avatar.tsx), o guard de app/_layout.tsx
   * trocaria (auth) por (tabs) automaticamente assim que o token aparece
   * -- essa flag adia essa troca enquanto true. So estado em memoria desta
   * sessao do app (nunca persistida em SecureStore/AsyncStorage), reseta
   * pra false sozinha se o app for reaberto do zero.
   */
  onboardingInProgress: boolean;
  setOnboardingInProgress: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingInProgress, setOnboardingInProgress] = useState(false);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  // Id do usuario da sessao atual -- descarta resposta de badges que chega
  // depois de um logout/troca de conta, pra nao gravar isPro do usuario errado.
  const currentUserIdRef = useRef<string | null>(null);
  // Momento da ultima busca de isPro (qualquer origem) -- base do throttle do retorno ao primeiro plano.
  const lastIsProFetchRef = useRef(0);

  const fetchIsPro = useCallback(async (userId: string): Promise<boolean | null> => {
    lastIsProFetchRef.current = Date.now();
    try {
      const badges = await getUserBadges(userId);
      if (currentUserIdRef.current !== userId) return null;
      setIsPro(badges.is_pro);
      return badges.is_pro;
    } catch {
      // Falha (rede/servidor): nao mexe em isPro -- fica null se nunca
      // carregou, ou mantem o ultimo valor conhecido. Nunca vira false.
      return null;
    }
  }, []);

  const loadUser = useCallback(async () => {
    const response = await api.get<User>('/users/me');
    currentUserIdRef.current = response.data.id;
    setUser(response.data);
    // Sem await de proposito: nao atrasa o boot/login (isLoading) por causa
    // do Pro -- quem precisa dele le `isPro === null` como "carregando".
    void fetchIsPro(response.data.id);
  }, [fetchIsPro]);

  const refreshIsPro = useCallback(async (): Promise<boolean | null> => {
    const userId = currentUserIdRef.current;
    return userId ? fetchIsPro(userId) : null;
  }, [fetchIsPro]);

  // O Pro e ativado pelo webhook do Stripe, fora do app: sem isto o isPro so seria relido no
  // login/boot. Ao voltar pro primeiro plano com sessao ativa, re-busca (no maximo 1x por 60 s).
  useEffect(() => {
    if (!token) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (Date.now() - lastIsProFetchRef.current < IS_PRO_FOREGROUND_THROTTLE_MS) return;
      void refreshIsPro();
    });
    return () => subscription.remove();
  }, [token, refreshIsPro]);

  useEffect(() => {
    (async () => {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (storedToken) {
        setAuthToken(storedToken);
        setToken(storedToken);
        try {
          await loadUser();
        } catch {
          // Token expirado/invalido — limpa o estado de sessao local.
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setAuthToken(null);
          setToken(null);
        }
      }
      setIsLoading(false);
    })();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const response = await api.post<{ access_token: string }>('/auth/login', { email, password });
        const newToken = response.data.access_token;
        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
        setAuthToken(newToken);
        setToken(newToken);
        await loadUser();
      } catch (error) {
        throw new Error(getApiErrorMessage(error, 'Nao foi possivel entrar. Verifique suas credenciais.'));
      }
    },
    [loadUser]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      try {
        await api.post('/auth/register', { name, email, password });
      } catch (error) {
        throw new Error(getApiErrorMessage(error, 'Nao foi possivel criar a conta.'));
      }
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
    setUser(null);
    currentUserIdRef.current = null;
    setIsPro(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshUser: loadUser,
        isPro,
        refreshIsPro,
        onboardingInProgress,
        setOnboardingInProgress,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return ctx;
}
