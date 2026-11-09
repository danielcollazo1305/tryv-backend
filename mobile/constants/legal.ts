/**
 * Links exibidos na tela de assinatura (a Apple exige Termos e Politica visiveis onde se compra) e em Ajustes.
 *
 * Os enderecos abaixo apontam para a landing (landing/terms.html e landing/privacy.html) em https://tryvfit.app, dominio informado
 * pelo responsavel. A confirmar antes do envio para a App Store: que as duas paginas estejam publicadas nesse dominio, nestes caminhos.
 */
const LEGAL_BASE_URL = 'https://tryvfit.app';

export const TERMS_URL = `${LEGAL_BASE_URL}/terms.html`;
export const PRIVACY_URL = `${LEGAL_BASE_URL}/privacy.html`;

/** Tela de assinaturas do Apple ID: unico lugar onde a Apple permite gerenciar/cancelar uma assinatura. */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
