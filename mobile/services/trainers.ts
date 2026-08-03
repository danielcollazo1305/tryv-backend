import { api } from '@/services/api';

export interface Trainer {
  id: string;
  user_id: string;
  user_name: string;
  cref_number: string;
  cref_verified: boolean;
  bio: string | null;
  price: number;
  active: boolean;
  platform_fee_percent: number;
  created_at: string;
}

export interface TrainerRegisterPayload {
  cref_number: string;
  bio?: string | null;
  price: number;
}

export interface TrainerUpdatePayload {
  bio?: string | null;
  price?: number | null;
}

export interface StripeOnboarding {
  onboarding_url: string;
}

export interface StripeStatus {
  stripe_account_id: string | null;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
}

export interface CheckoutSession {
  checkout_url: string;
}

export interface Student {
  user_id: string;
  name: string;
  is_live: boolean;
  live_activity_id: string | null;
}

export async function listTrainers(): Promise<Trainer[]> {
  const response = await api.get<Trainer[]>('/trainers/');
  return response.data;
}

export async function getTrainer(id: string): Promise<Trainer> {
  const response = await api.get<Trainer>(`/trainers/${id}`);
  return response.data;
}

export async function registerTrainer(payload: TrainerRegisterPayload): Promise<Trainer> {
  const response = await api.post<Trainer>('/trainers/register', payload);
  return response.data;
}

export async function getMyTrainerProfile(): Promise<Trainer> {
  const response = await api.get<Trainer>('/trainers/me');
  return response.data;
}

export async function updateMyTrainerProfile(payload: TrainerUpdatePayload): Promise<Trainer> {
  const response = await api.patch<Trainer>('/trainers/me', payload);
  return response.data;
}

export async function createStripeOnboardingLink(): Promise<StripeOnboarding> {
  const response = await api.post<StripeOnboarding>('/trainers/me/stripe-onboarding');
  return response.data;
}

export async function getStripeStatus(): Promise<StripeStatus> {
  const response = await api.get<StripeStatus>('/trainers/me/stripe-status');
  return response.data;
}

export async function subscribeToTrainer(trainerId: string): Promise<CheckoutSession> {
  const response = await api.post<CheckoutSession>(`/trainers/${trainerId}/subscribe`);
  return response.data;
}

export async function listMyStudents(): Promise<Student[]> {
  const response = await api.get<Student[]>('/trainers/me/students');
  return response.data;
}

export function formatPriceBRL(price: number): string {
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
