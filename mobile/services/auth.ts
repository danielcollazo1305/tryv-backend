import { api } from './api';

/**
 * Fluxo de recuperacao de senha (ver app/(auth)/forgot-password.tsx e
 * app/(auth)/reset-password.tsx). Nao passa por AuthContext porque
 * acontece inteiramente antes do login (sem token).
 */
export async function forgotPassword(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await api.post('/auth/reset-password', { email, code, new_password: newPassword });
}
