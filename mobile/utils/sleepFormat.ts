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
