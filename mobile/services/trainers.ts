import { api } from '@/services/api';

export type ProfessionalType = 'personal_trainer' | 'nutritionist';

export const PROFESSIONAL_TYPE_LABELS: Record<ProfessionalType, string> = {
  personal_trainer: 'Personal Trainer',
  nutritionist: 'Nutricionista',
};

/** CREF pra personal trainer, CRN pra nutricionista — mesmo campo (license_number), rotulo depende do tipo. */
export function licenseLabel(professionalType: ProfessionalType): string {
  return professionalType === 'nutritionist' ? 'CRN' : 'CREF';
}

/**
 * Especialidades por tipo de profissional (registro expandido) — mesmo
 * vocabulario validado no backend (app/core/trainer_specialties.py).
 * Slugs em ingles/sem acento (consistente com o resto do app), rotulos em
 * portugues aqui. "Emagrecimento" aparece nas duas listas de proposito —
 * e uma especialidade valida tanto pra personal trainer quanto nutricionista.
 */
export const SPECIALTIES_BY_PROFESSIONAL_TYPE: Record<ProfessionalType, { value: string; label: string }[]> = {
  personal_trainer: [
    { value: 'hipertrofia', label: 'Hipertrofia' },
    { value: 'emagrecimento', label: 'Emagrecimento' },
    { value: 'reabilitacao_fisioterapia_esportiva', label: 'Reabilitação/Fisioterapia esportiva' },
    { value: 'terceira_idade', label: 'Terceira idade' },
    { value: 'gestantes', label: 'Gestantes' },
    { value: 'powerlifting_forca', label: 'Powerlifting/Força' },
    { value: 'funcional', label: 'Funcional' },
    { value: 'corrida', label: 'Corrida' },
  ],
  nutritionist: [
    { value: 'emagrecimento', label: 'Emagrecimento' },
    { value: 'nutricao_esportiva', label: 'Nutrição esportiva' },
    { value: 'reeducacao_alimentar', label: 'Reeducação alimentar' },
    { value: 'vegetarianismo_veganismo', label: 'Vegetarianismo/Veganismo' },
    { value: 'disturbios_alimentares', label: 'Distúrbios alimentares' },
    { value: 'nutricao_clinica', label: 'Nutrição clínica' },
  ],
};

/** Rotulo em portugues de uma especialidade (procura nas 2 listas — o slug e unico o suficiente na pratica). */
export function specialtyLabel(value: string): string {
  const all = [...SPECIALTIES_BY_PROFESSIONAL_TYPE.personal_trainer, ...SPECIALTIES_BY_PROFESSIONAL_TYPE.nutritionist];
  return all.find((s) => s.value === value)?.label ?? value;
}

export interface Trainer {
  id: string;
  user_id: string;
  user_name: string;
  professional_type: ProfessionalType;
  license_number: string;
  cref_verified: boolean;
  bio: string | null;
  years_experience: number | null;
  specialties: string[];
  certifications: string | null;
  price: number;
  active: boolean;
  platform_fee_percent: number;
  created_at: string;
}

// Espelha TrainerPublicOut no backend — usado pela vitrine publica
// (GET /trainers/, GET /trainers/{id}), sem autenticacao. Sem
// platform_fee_percent: e um dado comercial interno, so o proprio
// profissional ve o proprio (Trainer, acima).
export interface TrainerPublic {
  id: string;
  user_id: string;
  user_name: string;
  professional_type: ProfessionalType;
  license_number: string;
  cref_verified: boolean;
  bio: string | null;
  years_experience: number | null;
  specialties: string[];
  certifications: string | null;
  price: number;
  active: boolean;
  created_at: string;
}

export interface TrainerRegisterPayload {
  professional_type: ProfessionalType;
  license_number: string;
  bio?: string | null;
  years_experience?: number | null;
  specialties?: string[];
  certifications?: string | null;
  price: number;
}

export interface TrainerUpdatePayload {
  bio?: string | null;
  price?: number | null;
  years_experience?: number | null;
  specialties?: string[];
  certifications?: string | null;
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

export async function listTrainers(): Promise<TrainerPublic[]> {
  const response = await api.get<TrainerPublic[]>('/trainers/');
  return response.data;
}

export async function getTrainer(id: string): Promise<TrainerPublic> {
  const response = await api.get<TrainerPublic>(`/trainers/${id}`);
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
