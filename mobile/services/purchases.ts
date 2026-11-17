import { Platform } from 'react-native';
import Purchases, { PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';

import { syncIapSubscription } from '@/services/subscriptions';

/**
 * Assinatura Tryv Pro por compra dentro do app (Apple IAP) via RevenueCat. A fonte da verdade do acesso Pro e o backend: o
 * RevenueCat avisa o servidor por webhook e o app so pergunta (POST /subscriptions/iap/sync). Nada aqui libera Pro por conta
 * propria, e nenhum preco e digitado no app: texto de preco e periodo vem do produto da loja.
 *
 * Chave publica do SDK: EXPO_PUBLIC_REVENUECAT_IOS_KEY (so o nome esta no repositorio; ver .env.example). Sem a chave, ou fora do
 * iOS, o SDK nem e configurado e `isPurchasesAvailable()` devolve false (a tela mostra "indisponivel").
 *
 * Em Expo Go o SDK roda em modo de pre-visualizacao (chamadas simuladas): compra de verdade so em development build.
 */

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

let configured = false;
// Promessa do logIn em andamento/concluido por usuario: a compra espera por ela, para nunca ser atribuida a um id anonimo.
let identifiedUserId: string | null = null;
let identifyPromise: Promise<void> | null = null;

export function isPurchasesAvailable(): boolean {
  return Platform.OS === 'ios' && IOS_API_KEY.length > 0;
}

/** Configura o SDK uma unica vez (chamada ao abrir o app). Nunca lanca. */
export function configurePurchases(): void {
  if (configured || !isPurchasesAvailable()) return;
  try {
    Purchases.configure({ apiKey: IOS_API_KEY });
    configured = true;
  } catch {
    configured = false;
  }
}

/** logIn com o id do usuario no Tryv (e o app_user_id que o webhook do backend mapeia para o usuario). Nunca lanca. */
export function identifyPurchasesUser(userId: string): Promise<void> {
  if (!configured) return Promise.resolve();
  if (identifiedUserId === userId && identifyPromise) return identifyPromise;
  identifiedUserId = userId;
  identifyPromise = Purchases.logIn(userId)
    .then(() => undefined)
    .catch(() => {
      // Falhou (rede): libera para tentar de novo na proxima chamada (ex.: ao comprar).
      if (identifiedUserId === userId) {
        identifiedUserId = null;
        identifyPromise = null;
      }
    });
  return identifyPromise;
}

/** logOut ao sair da conta. Nunca lanca (o SDK recusa logOut de usuario anonimo; isso e inofensivo). */
export async function resetPurchasesUser(): Promise<void> {
  identifiedUserId = null;
  identifyPromise = null;
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // ja anonimo ou sem rede: nada a fazer
  }
}

export interface ProOffer {
  /** Pacote a comprar (passado de volta para purchasePro). */
  pkg: PurchasesPackage;
  /** Preco ja formatado pela loja na moeda do usuario (ex.: "R$ 22,90"). Nunca digitado no app. */
  priceString: string;
  /** Periodo legivel vindo do produto (ex.: "mês"); null se a loja nao informou. */
  periodLabel: string | null;
}

/** "P1M" -> "mês", "P1Y" -> "ano", "P3M" -> "3 meses", "P1W" -> "semana"... (ISO 8601, como a loja informa). */
export function formatSubscriptionPeriod(iso: string | null | undefined): string | null {
  const match = /^P(\d+)([DWMY])$/.exec(iso ?? '');
  if (!match) return null;
  const count = Number(match[1]);
  const names: Record<string, [string, string]> = { D: ['dia', 'dias'], W: ['semana', 'semanas'], M: ['mês', 'meses'], Y: ['ano', 'anos'] };
  const [singular, plural] = names[match[2]];
  return count === 1 ? singular : `${count} ${plural}`;
}

/** Oferta atual do RevenueCat: o pacote mensal, ou o primeiro disponivel. Lanca em falha; null = sem oferta configurada. */
export async function loadProOffer(): Promise<ProOffer | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  const pkg = current?.monthly ?? current?.availablePackages[0] ?? null;
  if (!pkg) return null;
  return {
    pkg,
    priceString: pkg.product.priceString,
    periodLabel: formatSubscriptionPeriod(pkg.product.subscriptionPeriod),
  };
}

export class PurchaseError extends Error {}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending';

/** Compra o pacote. Cancelamento pelo usuario NAO e erro ('cancelled'); "Pedir para comprar"/aprovacao pendente = 'pending'. */
export async function purchasePro(userId: string, pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  await identifyPurchasesUser(userId);
  try {
    await Purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (error) {
    const e = error as { code?: string; userCancelled?: boolean | null };
    if (e.userCancelled === true || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    if (e.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    // Ja tem a assinatura nesta conta Apple: trata como compra concluida (o sync confirma com o servidor).
    if (e.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) return 'purchased';
    if (e.code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
      throw new PurchaseError('Sem conexão. Verifique sua internet e tente de novo.');
    }
    throw new PurchaseError('Não foi possível concluir a compra. Tente novamente.');
  }
}

/** Restaurar compras (exigencia da Apple). Lanca PurchaseError em falha. */
export async function restorePurchases(userId: string): Promise<void> {
  await identifyPurchasesUser(userId);
  try {
    await Purchases.restorePurchases();
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
      throw new PurchaseError('Sem conexão. Verifique sua internet e tente de novo.');
    }
    throw new PurchaseError('Não foi possível restaurar suas compras. Tente novamente.');
  }
}

const SYNC_MAX_ATTEMPTS = 6;
const SYNC_INTERVAL_MS = 2000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ProSyncResult {
  /** O SERVIDOR confirmou o Pro (assinatura valida agora). */
  isPro: boolean;
  /** Depois de todas as tentativas o servidor ainda nao tinha registro: o webhook pode estar atrasado. */
  pending: boolean;
}

/**
 * Depois da compra ou do restaurar: pergunta ao servidor (POST /subscriptions/iap/sync) algumas vezes enquanto pending=true (o
 * webhook do RevenueCat pode demorar alguns segundos), e entao atualiza o isPro do app (refreshIsPro). So `isPro: true`
 * significa Pro; falha de rede nunca vira "nao e Pro" (a ultima tentativa que falhar relanca o erro).
 */
export async function syncProAfterPurchase(refreshIsPro: () => Promise<boolean | null>): Promise<ProSyncResult> {
  let last: { is_pro: boolean; pending: boolean } | null = null;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      last = await syncIapSubscription();
      lastError = null;
      if (last.is_pro || !last.pending) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < SYNC_MAX_ATTEMPTS) await sleep(SYNC_INTERVAL_MS);
  }
  if (!last && lastError) throw lastError;
  const refreshed = await refreshIsPro();
  return { isPro: last?.is_pro === true || refreshed === true, pending: !!last?.pending && !(last?.is_pro) && refreshed !== true };
}
