/** Duracao de sono em minutos: "7h 43m"; abaixo de 1 h, "45m"; hora cheia, "7h 00m". */
export function formatSleepMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

/** Duracao de sono em horas decimais (ex: 7.72 -> "7h 43m"). Mesmo formato do detalhe do sono. */
export function formatSleepDuration(hours: number): string {
  return formatSleepMinutes(hours * 60);
}
