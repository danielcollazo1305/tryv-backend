// Convite para usar o app (E12): logica PURA da mensagem e do resultado do compartilhamento (sem React Native), testada no Node
// (Claude outputs/try_convidar_app.mjs). O envio em si fica em utils/invite.ts.

/** Mensagem de convite sem link (o app ainda nao tem URL de loja; nada de inventar uma). */
export const INVITE_BASE_MESSAGE = 'Estou usando o Tryv para treinar e cuidar da alimentacao. Vem comigo!';

/**
 * Mensagem de convite. `storeUrl` vazio, ausente ou que nao seja um endereco http(s) = so a mensagem base (sem link, sem "undefined").
 * Preenchido = o link entra no fim, em uma linha propria.
 */
export function buildInviteMessage(storeUrl?: string | null): string {
  const url = typeof storeUrl === 'string' ? storeUrl.trim() : '';
  if (url === '' || !/^https?:\/\/\S+$/i.test(url)) return INVITE_BASE_MESSAGE;
  return `${INVITE_BASE_MESSAGE}\n${url}`;
}

/** 'dismissed' = a pessoa fechou a folha de compartilhar (nao e erro e nao mostra nada); 'failed' = a folha nao abriu/falhou. */
export type InviteOutcome = 'shared' | 'dismissed' | 'failed';

/** Resultado de Share.share (action 'sharedAction' ou 'dismissedAction') -> o que a tela deve fazer. */
export function inviteOutcomeFromShareResult(result: unknown): InviteOutcome {
  const action = result && typeof result === 'object' ? (result as { action?: unknown }).action : undefined;
  return action === 'dismissedAction' ? 'dismissed' : 'shared';
}
