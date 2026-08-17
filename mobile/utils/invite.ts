import { Share } from 'react-native';

/**
 * Nenhum link de loja (App Store/Play Store) nem site foi encontrado em
 * lugar nenhum do projeto (.env, app.json, eas.json) -- o app
 * provavelmente ainda nao foi publicado nas lojas. Mensagem generica so
 * com o nome do app, sem inventar uma URL falsa. Quando houver um link
 * real, adicionar aqui.
 */
export async function shareInvite(): Promise<void> {
  await Share.share({
    message: 'Estou usando o Tryv para treinar e cuidar da alimentacao. Vem comigo!',
  });
}

export async function shareProfile(userName: string): Promise<void> {
  await Share.share({
    message: `Me segue no Tryv! Sou ${userName}.`,
  });
}
