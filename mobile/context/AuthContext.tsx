import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

import { api, getApiErrorMessage, setAuthToken } from '@/services/api';

const TOKEN_KEY = 'tryv_auth_token';

export interface User {
  id: string;
  name: string;
  email: string;
  weight: number | null;
  height: number | null;
  goal: string | null;
  daily_calorie_goal: number | null;
  subscription_status: string;
  created_at: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const response = await api.get<User>('/users/me');
    setUser(response.data);
  }, []);

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
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser: loadUser }}>
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
