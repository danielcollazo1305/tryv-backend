import * as Contacts from 'expo-contacts';

export interface DeviceContact {
  /** Id local do dispositivo (expo-contacts) -- nunca enviado como "telefone", so como referencia opaca (ver ContactEntry). */
  id: string;
  name: string;
  /** Numeros normalizados (so digitos, com DDI) -- unico dado de fato enviado ao backend. */
  phoneNumbers: string[];
}

export async function getContactsPermissionStatus(): Promise<Contacts.PermissionStatus> {
  const { status } = await Contacts.getPermissionsAsync();
  return status;
}

export async function requestContactsPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Remove formatacao (parenteses, espacos, tracos, "+") e assume DDI 55
 * (Brasil) quando o numero nao vem com um DDI explicito -- padrao razoavel
 * pedido, ja que o app e voltado ao mercado brasileiro. Numeros que ja
 * chegam com DDI 55 explicito (12-13 digitos) ficam como estao; numeros
 * bem mais longos (outro DDI) sao mantidos como vieram, melhor esforco.
 */
export function normalizePhoneNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Le a agenda do dispositivo e extrai SO nome (fica no app, nunca sai
 * daqui) + numeros de telefone normalizados (os unicos dados que
 * eventualmente vao pro backend, via matchContacts). Contatos sem nenhum
 * numero de telefone sao descartados -- nao servem pro match nem pro convite.
 */
export async function fetchDeviceContacts(): Promise<DeviceContact[]> {
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });

  const result: DeviceContact[] = [];
  for (const contact of data) {
    const numbers = (contact.phoneNumbers ?? [])
      .map((p) => (p.number ? normalizePhoneNumber(p.number) : null))
      .filter((n): n is string => !!n);
    if (numbers.length === 0 || !contact.id) continue;
    result.push({ id: contact.id, name: contact.name ?? 'Contato', phoneNumbers: numbers });
  }
  return result;
}
