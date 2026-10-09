/**
 * Helpers de data e numero da fileira "Ultimos 7 dias" e da tela do dia (Refeicoes). Tudo em pt-BR e SEM
 * depender de Intl (nomes de dia/mes e separador de milhar escritos aqui, para o resultado ser identico em
 * qualquer aparelho). As datas vem do servidor como 'YYYY-MM-DD' (dia local do servidor) e sao lidas pelos
 * componentes Y/M/D, nunca via `new Date('YYYY-MM-DD')` (que seria UTC e puxaria o dia para tras).
 */

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' valido (inclusive dia que existe no calendario) -> Date local ao meio-dia; senao null. */
export function parseDateOnly(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** "1.240" (separador de milhar com ponto, sem casas decimais). */
export function formatKcalNumber(value: number): string {
  return String(Math.round(value || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "1.240 kcal". */
export function formatKcal(value: number): string {
  return `${formatKcalNumber(value)} kcal`;
}

/** Rotulo da aba do cartao: "Hoje", "Ontem" e depois o dia da semana abreviado ("Seg", "Ter"...). */
export function dayTabLabel(date: string, index: number): string {
  if (index === 0) return 'Hoje';
  if (index === 1) return 'Ontem';
  const parsed = parseDateOnly(date);
  return parsed ? WEEKDAYS_SHORT[parsed.getDay()] : '';
}

/** "qui 9" (dia da semana abreviado em minusculas + dia do mes). */
export function dayShortLabel(date: string): string {
  const parsed = parseDateOnly(date);
  return parsed ? `${WEEKDAYS_SHORT[parsed.getDay()].toLowerCase()} ${parsed.getDate()}` : '';
}

/** "Quarta, 8 de outubro". */
export function formatLongDate(date: string): string {
  const parsed = parseDateOnly(date);
  if (!parsed) return date;
  return `${WEEKDAYS_LONG[parsed.getDay()]}, ${parsed.getDate()} de ${MONTHS_LONG[parsed.getMonth()]}`;
}

/** "1 refeição" / "2 refeições" / "nenhuma refeição". */
export function mealsCountLabel(count: number): string {
  if (count <= 0) return 'nenhuma refeição';
  return count === 1 ? '1 refeição' : `${count} refeições`;
}

/** Rotulo de acessibilidade do cartao: "Hoje, 1.240 quilocalorias, 2 refeições". */
export function dayAccessibilityLabel(tab: string, kcal: number, mealsCount: number): string {
  return `${tab}, ${formatKcalNumber(kcal)} quilocalorias, ${mealsCountLabel(mealsCount)}`;
}
