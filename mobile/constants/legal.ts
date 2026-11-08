/**
 * Links exibidos na tela de assinatura (a Apple exige Termos e Politica visiveis onde se compra) e em Ajustes.
 *
 * ATENCAO (a confirmar): os enderecos abaixo assumem que a landing (landing/terms.html e landing/privacy.html) esta publicada
 * em https://tryv.com.br. O dominio nao esta registrado em nenhum arquivo do repositorio alem do e-mail de contato; confirme a URL
 * real das paginas publicadas antes do envio para a App Store e ajuste LEGAL_BASE_URL.
 */
const LEGAL_BASE_URL = 'https://tryv.com.br';

export const TERMS_URL = `${LEGAL_BASE_URL}/terms.html`;
export const PRIVACY_URL = `${LEGAL_BASE_URL}/privacy.html`;

/** Tela de assinaturas do Apple ID: unico lugar onde a Apple permite gerenciar/cancelar uma assinatura. */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
