/**
 * Preço mensal do Tryv Fit Pro EXIBIDO no app — única fonte no mobile (usada por
 * app/subscriptions/checkout.tsx e app/subscriptions/pro.tsx).
 *
 * Atenção: isto é só o texto mostrado ao usuário. O valor COBRADO vem do Price do Stripe apontado por
 * STRIPE_PRO_PRICE_ID no backend. Ao mudar o preço: (1) criar um novo Price no Stripe, (2) atualizar
 * STRIPE_PRO_PRICE_ID no Railway, (3) atualizar a constante abaixo e (4) o preço da landing
 * (landing/index.html). Os quatro precisam andar juntos.
 */
export const PRO_PRICE_MONTHLY_BRL = 22.9;

/** "R$ 22,90" — derivado da constante acima, para o texto nunca divergir do número. */
export const PRO_PRICE_MONTHLY_LABEL = PRO_PRICE_MONTHLY_BRL.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
