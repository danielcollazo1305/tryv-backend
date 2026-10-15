/**
 * Interruptores de funcionalidades do app.
 *
 * CONTACTS_DISCOVERY_ENABLED: aba "Contatos" em Descobrir (social/discover.tsx). DESLIGADA porque nenhum usuario tem
 * telefone salvo (backend: User.phone_number nao e coletado), entao a busca por contatos nunca encontra ninguem e so pediria
 * a permissao da agenda sem retorno. Com false o app NAO pede a permissao de contatos em lugar nenhum. O codigo
 * (services/contacts.ts, POST /users/match-contacts) foi mantido; religar so junto com a coleta de telefone e o texto de
 * privacidade (ver o review do E4e).
 */
export const CONTACTS_DISCOVERY_ENABLED: boolean = false;
