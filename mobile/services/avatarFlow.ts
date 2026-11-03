// Logica PURA do fluxo foto/avatar do perfil (consentimento, texto do aviso, restricao por idade). Sem React nem imports do app, para ser testada
// direto em Node (ver Claude outputs/try_avatar_app.mjs). A versao do consentimento TEM de ser a mesma do servidor
// (backend/app/services/avatar_profile.py: AVATAR_CONSENT_VERSION); o servidor recusa (400) uma versao diferente.

export const AVATAR_CONSENT_VERSION = '2026-11-v1';

export const AVATAR_CONSENT_TITLE = 'Usar sua foto no Tryv';

export const AVATAR_CONSENT_PARAGRAPHS: readonly string[] = [
  'Para criar seu avatar, enviamos sua foto à OpenAI, uma empresa de inteligência artificial, que gera uma versão em estilo anime.',
  'Guardamos sua foto e o avatar em um local privado da sua conta. Só a imagem que você escolher usar, a foto ou o avatar, aparece para outras pessoas no Tryv: no seu perfil, no feed, nos rankings e nos clubes.',
  'Você pode trocar entre foto e avatar, ou remover tudo quando quiser. Se excluir sua conta, apagamos as duas.',
];

export const AVATAR_CONSENT_ACCEPT = 'Concordo e continuar';
export const AVATAR_CONSENT_DECLINE = 'Agora não';

export const AVATAR_LOADING_TEXT = 'Gerando seu avatar… isso pode levar até 2 minutos.';

export const AVATAR_MINOR_MESSAGE =
  'Por segurança, foto e avatar de perfil ainda não estão disponíveis para menores de 18 anos ou para quem não informou a data de nascimento.';

export const AVATAR_MIN_AGE = 18;

function parseDateOnly(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return { y, m, d };
}

/** Idade em anos completos hoje (data local), ou null se a data for ausente/invalida. */
export function ageInYears(dateOfBirth: string | null | undefined, today: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = parseDateOnly(dateOfBirth);
  if (!dob) return null;
  let age = today.getFullYear() - dob.y;
  const beforeBirthday = today.getMonth() + 1 < dob.m || (today.getMonth() + 1 === dob.m && today.getDate() < dob.d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Envio de foto e geracao de avatar ficam desabilitados para menores de 18 e para quem nao informou a data de nascimento (mesma regra do servidor). */
export function isAvatarRestricted(dateOfBirth: string | null | undefined, today: Date = new Date()): boolean {
  const age = ageInYears(dateOfBirth, today);
  return age === null || age < AVATAR_MIN_AGE;
}

export type AvatarSource = 'photo' | 'avatar';

export const AVATAR_SOURCE_LABELS: Record<AvatarSource, string> = { photo: 'Foto', avatar: 'Avatar' };

/** "Restam N de M geracoes" para o botao de gerar de novo. */
export function generationsText(remaining: number, limit: number, windowDays: number): string {
  if (remaining <= 0) return `Você usou as ${limit} gerações dos últimos ${windowDays} dias.`;
  return `Restam ${remaining} de ${limit} gerações nos últimos ${windowDays} dias.`;
}
