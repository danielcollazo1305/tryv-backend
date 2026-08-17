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

/**
 * Cores de destaque por tipo de dado de saude (inspirado no app Saude da
 * Apple, que usa uma cor por metrica) — tons escolhidos pra combinar com o
 * roxo/violeta principal do Tryv em vez de reproduzir as cores literais da
 * Apple. Usadas so no card de Apple Health (HealthMetricRow), nao no resto
 * do app.
 */
export const metricColors = {
  steps: '#F5A524',
  distance: '#38BDF8',
  energy: '#FB7185',
  heartRate: '#F87171',
  sleep: '#818CF8',
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

export const theme = { colors, spacing, radius, typography, metricColors };

export default theme;

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Sistema visual novo (redesign "liquiglass", ago/2026) — extraido dos
 * prototipos HTML em scratchpad/onboarding/ (24 telas, todas compartilhando
 * o mesmo tailwind.config e bloco <style>: liquiglass-card / neon-glow /
 * metallic-text / text-glow).
 *
 * Convive com o sistema acima (colors/spacing/radius/typography) enquanto
 * as telas sao migradas uma a uma, tela por tela — NAO usar os tokens
 * antigos em telas que adotam este design novo, pra nao misturar paleta.
 * Quando todas as telas estiverem migradas, o sistema antigo pode ser
 * removido e este pode perder o sufixo "2".
 *
 * Nomes seguem os tokens Material do tailwind.config original so onde
 * fazia sentido; a maioria foi simplificada pra so o que de fato aparece
 * usado nos designs (o config completo tem ~40 tokens de cor, a maioria
 * nunca referenciada em nenhuma tela).
 * ─────────────────────────────────────────────────────────────────────────
 */

export const colors2 = {
  // background / surface / surface-dim sao todos a mesma cor no config
  // original — um so token aqui.
  background: '#131313',

  surfaceContainerLowest: '#0e0e0e',
  surfaceContainerLow: '#1c1b1b',
  surfaceContainer: '#201f1f',
  surfaceContainerHigh: '#2a2a2a',
  // surface-container-highest == surface-variant no config original
  surfaceContainerHighest: '#353534',
  surfaceBright: '#393939',

  onSurface: '#e5e2e1', // texto principal, quase branco
  onSurfaceVariant: '#cbc3d7', // texto secundario
  outline: '#958ea0',
  outlineVariant: '#494454', // bordas sutis (liquiglass-card etc.)

  primary: '#d0bcff', // lavanda claro — texto/icone de destaque (NAO os botoes de acao, ver `violet`)
  primaryContainer: '#a078ff',
  onPrimaryContainer: '#340080',
  secondary: '#ddb7ff',
  tertiary: '#dbb8ff',

  // Nao fazem parte da paleta Material do tailwind.config — sao hex
  // literais usados direto nos designs pra botoes de CTA e efeito glow
  // (ex: bg-[#8B5CF6], gradientes de glow).
  violet: '#8B5CF6',
  violetGlow: '#A855F7',

  error: '#ffb4ab',
  // Tambem hex literais (nao fazem parte da paleta Material) — usados em
  // indicadores de tendencia positiva/negativa (Home, Atividades).
  success: '#4ade80',
  danger: '#f87171',

  white: '#ffffff',
} as const;

export const spacing2 = {
  xs: 4,
  sm: 8,
  md: 16,
  gutter: 16, // mesmo valor de md — nome semantico usado em grids/listas
  lg: 24,
  xl: 40,
  containerMargin: 20, // padding horizontal padrao das telas (px-container-margin)
} as const;

/**
 * O tailwind.config original redefine `borderRadius.full` para 0.75rem
 * (12px) em vez do padrao do Tailwind (9999px) — isso e um bug de
 * autoria que ficou nos 24 HTMLs (rounded-full em avatares/pills
 * tecnicamente renderizaria como quadrado com canto de 12px, nao um
 * circulo/pill de verdade, se alguem realmente carregasse o CDN do
 * Tailwind e conferisse pixel a pixel). Os valores abaixo usam a
 * INTENCAO visual do design (avatares circulares, nav em pill) em vez
 * do valor literal com bug — nao portar `full: 12px` pro RN.
 */
export const radius2 = {
  sm: 8, // chips pequenos, inputs
  md: 12, // rounded-lg / rounded-xl na maioria dos cards
  lg: 20, // rounded-2xl (cards maiores, ex: exercicios do Treino)
  pill: 9999, // avatares, badges, nav — circulo/pill de verdade
} as const;

/**
 * Nomes de fonte batem exatamente com as constantes exportadas por
 * @expo-google-fonts/inter e @expo-google-fonts/jetbrains-mono — ver
 * app/_layout.tsx (useFonts). Nao usar string literal solta em nenhum
 * componente; sempre importar typography2 daqui.
 */
const fonts2 = {
  interRegular: 'Inter_400Regular',
  interSemiBold: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
  interExtraBold: 'Inter_800ExtraBold',
  jetBrainsMonoSemiBold: 'JetBrainsMono_600SemiBold',
  jetBrainsMonoBold: 'JetBrainsMono_700Bold',
} as const;

export const typography2 = {
  // 48px/52px, -0.04em de letter-spacing (= -1.92px em 48px)
  displayHero: {
    fontFamily: fonts2.interExtraBold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.92,
    color: colors2.onSurface,
  },
  // 32px/40px, -0.02em (= -0.64px)
  headlineLg: {
    fontFamily: fonts2.interBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.64,
    color: colors2.onSurface,
  },
  headlineLgMobile: {
    fontFamily: fonts2.interBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors2.onSurface,
  },
  headlineMd: {
    fontFamily: fonts2.interSemiBold,
    fontSize: 24,
    lineHeight: 32,
    color: colors2.onSurface,
  },
  bodyLg: {
    fontFamily: fonts2.interRegular,
    fontSize: 18,
    lineHeight: 28,
    color: colors2.onSurface,
  },
  bodyMd: {
    fontFamily: fonts2.interRegular,
    fontSize: 16,
    lineHeight: 24,
    color: colors2.onSurface,
  },
  metricMono: {
    fontFamily: fonts2.jetBrainsMonoBold,
    fontSize: 20,
    lineHeight: 24,
    color: colors2.onSurface,
  },
  // 12px/16px, 0.1em (= +1.2px), uppercase — usado em labels/legendas
  labelCaps: {
    fontFamily: fonts2.jetBrainsMonoSemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: colors2.onSurfaceVariant,
  },
  // Label de botao (Button2) — sem "color" fixo aqui, cada variante do
  // botao decide a cor (branco no primary, colors2.primary no secondary).
  button: {
    fontFamily: fonts2.interBold,
    fontSize: 16,
    lineHeight: 20,
  },
} as const;

/** Nomes de fonte pra passar direto ao useFonts em app/_layout.tsx. */
export const fontsToLoad2 = {
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  Inter_800ExtraBold: require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf'),
  JetBrainsMono_600SemiBold: require('@expo-google-fonts/jetbrains-mono/600SemiBold/JetBrainsMono_600SemiBold.ttf'),
  JetBrainsMono_700Bold: require('@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf'),
};

export const theme2 = { colors: colors2, spacing: spacing2, radius: radius2, typography: typography2 };
