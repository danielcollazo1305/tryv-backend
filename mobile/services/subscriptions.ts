import { api } from '@/services/api';

export interface CheckoutSession {
  checkout_url: string;
}

export interface IapSyncResult {
  is_pro: boolean;
  /** true = o servidor ainda nao recebeu o aviso do RevenueCat (webhook a caminho): consultar de novo em instantes. */
  pending: boolean;
  status: string | null;
  expires_at: string | null;
  product_id: string | null;
  environment: 'sandbox' | 'production' | null;
}

/** Estado da assinatura por compra no app, como o servidor registrou. Nao envia nada do app (o servidor nao confia no cliente). */
export async function syncIapSubscription(): Promise<IapSyncResult> {
  const response = await api.post<IapSyncResult>('/subscriptions/iap/sync');
  return response.data;
}

export async function checkoutTryvPro(): Promise<CheckoutSession> {
  const response = await api.post<CheckoutSession>('/subscriptions/pro/checkout');
  return response.data;
}
