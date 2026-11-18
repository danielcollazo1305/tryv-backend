/** Duracao de sono em minutos: "7h 43m"; abaixo de 1 h, "45m"; hora cheia, "7h 00m". */
export function formatSleepMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

/**
 * Titulo da noite na tela de Sono: "Noite de seg, 16 de nov." pela data em que a pessoa ACORDOU (fim da noite), NUNCA pela data de hoje: a noite 02:20-11:54 de segunda
 * continua sendo "de seg, 16" depois da meia-noite. Sem horario de acordar valido, usa `fallback` (hoje). Horario local do aparelho.
 */
export function formatNightLabel(endedAtIso: string | null | undefined, fallback: Date = new Date()): string {
  const parsed = endedAtIso ? new Date(endedAtIso) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback;
  const label = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  return `Noite de ${label.replace('.', '')}`;
}

/** Duracao de sono em horas decimais (ex: 7.72 -> "7h 43m"). Mesmo formato do detalhe do sono. */
export function formatSleepDuration(hours: number): string {
  return formatSleepMinutes(hours * 60);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" local de um instante ISO; invalido = "--:--". */
export function formatClock(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '--:--';
}

/** Titulo do estado "aguardando" da tela de Sono (so ha um trecho parcial, nenhuma noite completa). */
export const SLEEP_WAITING_TITLE = 'Aguardando a noite completa.';

/**
 * Faixa de aviso do trecho parcial: "Recebemos só um trecho (09:52–11:54, 2h 02m). Abra o app do seu relógio para sincronizar a noite completa." A duracao e a do trecho
 * (fim − início), no mesmo formato da tela ("2h 02m").
 */
export function formatPartialSleepNote(startedAtIso: string, endedAtIso: string, spanMinutes: number): string {
  return `Recebemos só um trecho (${formatClock(startedAtIso)}–${formatClock(endedAtIso)}, ${formatSleepMinutes(spanMinutes)}). Abra o app do seu relógio para sincronizar a noite completa.`;
}
