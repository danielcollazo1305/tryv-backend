/**
 * Sistema de tema centralizado do Tryv — cores, tipografia e espaçamento.
 * Referência visual: Instagram (feed/perfil) + Strava (números grandes de
 * estatísticas), com paleta própria (fundo quase preto + roxo/violeta vibrante).
 */

export const colors = {
  background: '#0B0B0F',
  surface: '#17171C',
  surfaceElevated: '#1E1E25',
  border: '#27272E',

  accent: '#8B5CF6',
  accentMuted: '#6D28D9',
  accentSoft: 'rgba(139, 92, 246, 0.15)',

  text: '#F5F5F7',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',

  danger: '#F87171',
  success: '#34D399',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  // Numeros grandes e em negrito para estatisticas (distancia, calorias, pace) — estilo Strava
  statNumber: {
    fontSize: 40,
    fontWeight: '800' as const,
    color: colors.text,
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.text },
  bodySecondary: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
  caption: { fontSize: 12, fontWeight: '500' as const, color: colors.textMuted },
  button: { fontSize: 16, fontWeight: '700' as const, color: colors.white },
} as const;

export const theme = { colors, spacing, radius, typography };

export default theme;
