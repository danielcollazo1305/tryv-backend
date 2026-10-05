import { parseUtcDate } from '@/services/challenges';
import { colors3 } from '@/constants/theme';

/** A partir deste percentual a barra vira aviso; a partir de 100, erro. */
export const USAGE_WARNING_PERCENT = 80;
export const USAGE_LIMIT_PERCENT = 100;

export type UsageLevel = 'ok' | 'warning' | 'danger';

export function usageLevel(percent: number): UsageLevel {
  if (percent >= USAGE_LIMIT_PERCENT) return 'danger';
  if (percent >= USAGE_WARNING_PERCENT) return 'warning';
  return 'ok';
}

export const USAGE_COLORS: Record<UsageLevel, string> = {
  ok: colors3.primary,
  warning: colors3.tertiaryContainer,
  danger: colors3.error,
};

/** Largura visual da barra: limitada a 100% (o texto continua mostrando o numero real). */
export function barFillPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent));
}

/** "1.234,5" -- 1 casa decimal so quando nao e inteiro. */
export function formatKm(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

/** Aceita "12,5" e "12.5"; vazio ou invalido -> null. */
export function parseKmInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function localDayNumber(date: Date): number {
  // Dias de calendario no fuso LOCAL do aparelho (ignora a hora): Date.UTC com os campos locais.
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/**
 * "Último uso hoje / ontem / há N dias" a partir de last_used_at (UTC naive do servidor). O dia e o dia LOCAL
 * do aparelho, nao o dia UTC.
 */
export function lastUsedLabel(lastUsedAt: string | null, now: Date = new Date()): string {
  if (!lastUsedAt) return 'Ainda não usado';
  const days = localDayNumber(now) - localDayNumber(parseUtcDate(lastUsedAt));
  if (days <= 0) return 'Último uso hoje';
  if (days === 1) return 'Último uso ontem';
  return `Último uso há ${days} dias`;
}
