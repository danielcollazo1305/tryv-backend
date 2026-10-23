import { Share } from 'react-native';

import { InviteOutcome, buildInviteMessage, inviteOutcomeFromShareResult } from '@/services/inviteMessage';

/**
 * Link de loja (App Store/Play Store) do app. VAZIO enquanto o app nao for publicado: a mensagem de convite sai sem link (nada de inventar
 * uma URL). Quando houver o link real, preencher aqui e o convite passa a levar o link no fim.
 */
export const APP_STORE_URL = '';

/**
 * Abre a folha de compartilhar do sistema com o convite para usar o app. NUNCA lanca: fechar a folha e 'dismissed' (nao e erro) e uma
 * falha inesperada vira 'failed' para a tela decidir o aviso.
 */
export async function shareInvite(): Promise<InviteOutcome> {
  try {
    const result = await Share.share({ message: buildInviteMessage(APP_STORE_URL) });
    return inviteOutcomeFromShareResult(result);
  } catch {
    return 'failed';
  }
}

export async function shareProfile(userName: string): Promise<void> {
  await Share.share({
    message: `Me segue no Tryv! Sou ${userName}.`,
  });
}

/** Convite para um squad (nao confundir com shareInvite, que convida para o app): repassa o codigo de 6 caracteres. */
export async function shareSquadInvite(inviteCode: string): Promise<void> {
  await Share.share({
    message: `Entra no meu squad no Tryv Fit! Código: ${inviteCode}`,
  });
}
