import { api } from '@/services/api';

export interface CheckoutSession {
  checkout_url: string;
}

export async function checkoutTryvPro(): Promise<CheckoutSession> {
  const response = await api.post<CheckoutSession>('/subscriptions/pro/checkout');
  return response.data;
}
