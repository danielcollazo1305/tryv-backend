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

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Sistema visual novo (redesign "prism-glass", ago/2026) — extraido do HTML
 * "TRYV - Dashboard" (tailwind.config inline + classes .prism-glass/
 * .prism-glass-card). Fundo claro + cards em vidro fosco (branco translucido
 * + blur), no lugar do fundo escuro + glow roxo neon do sistema "2"
 * (liquiglass) acima.
 *
 * Mesma convivencia que colors2 tem com colors: comeca pela Home, migra
 * tela por tela — NAO usar os tokens deste bloco em telas que ainda nao
 * foram migradas (Feed/Refeicoes/Treino/Desafios continuam no sistema "2"
 * ate serem migradas tambem), e vice-versa, pra nao misturar paleta dentro
 * da mesma tela.
 *
 * Nomes de cor seguem 1:1 as chaves do tailwind.config do HTML (mesmo
 * criterio de fidelidade do bloco colors2 acima) — inclui toda a paleta
 * Material exportada la, mesmo a que a Home nao usa ainda (secondary/
 * tertiary), pra as proximas telas migradas nao precisarem redescobrir os
 * hex certos.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const colors3 = {
  background: '#fcf9f8',
  surface: '#fcf9f8',
  surfaceDim: '#dcd9d9',
  surfaceBright: '#fcf9f8',

  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f6f3f2',
  surfaceContainer: '#f0edec',
  surfaceContainerHigh: '#ebe7e7',
  surfaceContainerHighest: '#e5e2e1',
  surfaceVariant: '#e5e2e1',

  onSurface: '#1c1b1b',
  onSurfaceVariant: '#494454',
  onBackground: '#1c1b1b',
  inverseSurface: '#313030',
  inverseOnSurface: '#f3f0ef',

  outline: '#7b7486',
  outlineVariant: '#cbc3d7',

  primary: '#6b38d4',
  primaryContainer: '#8455ef',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#fffbff',
  primaryFixed: '#e9ddff',
  primaryFixedDim: '#d0bcff',
  onPrimaryFixed: '#23005c',
  onPrimaryFixedVariant: '#5516be',
  inversePrimary: '#d0bcff',
  surfaceTint: '#6d3bd7',

  // Nao aparecem em nenhum elemento visivel da Home hoje — inclusos pra
  // fidelidade ao tailwind.config de origem (proximas telas migradas podem
  // precisar).
  secondary: '#006b5f',
  secondaryContainer: '#62fae3',
  onSecondary: '#ffffff',
  onSecondaryContainer: '#007165',
  secondaryFixed: '#62fae3',
  secondaryFixedDim: '#3cddc7',
  onSecondaryFixed: '#00201c',
  onSecondaryFixedVariant: '#005047',

  // "tertiary" no HTML de origem e um tom quente (ambar/laranja), usado no
  // pill "Corrida" selecionado ([#ffb869]/[#2c1700] hardcoded no HTML em
  // vez das chaves tertiary-*, mas sao os mesmos tons) — mesmo papel que
  // metricColors.steps ja cobre no sistema antigo.
  tertiary: '#855000',
  tertiaryContainer: '#a76500',
  onTertiary: '#ffffff',
  onTertiaryContainer: '#fffbff',
  tertiaryFixed: '#ffdcbb',
  tertiaryFixedDim: '#ffb869',
  onTertiaryFixed: '#2c1700',
  onTertiaryFixedVariant: '#673d00',

  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onError: '#ffffff',
  onErrorContainer: '#93000a',

  white: '#ffffff',
} as const;

export const spacing3 = {
  xs: 4,
  sm: 8, // "unit"
  md: 16, // "gutter"
  lg: 24, // "container-margin"
  xl: 48, // "section-gap"
  containerMargin: 24,
  sectionGap: 48,
} as const;

export const radius3 = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16, // rounded-2xl usado nos cards de vidro — nao esta no tailwind.config (que so define ate "xl"=12), mas e o valor de fato usado em toda classe rounded-2xl do HTML.
  pill: 9999,
} as const;

/** Nomes de fonte identicos aos de fonts2 (mesma familia Inter ja carregada em app/_layout.tsx) — o HTML nao usa JetBrains Mono em lugar nenhum, so Inter. */
const fonts3 = {
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_400Regular', // 500 nao esta entre os pesos carregados (400/600/700/800) — 400 e a aproximacao mais proxima disponivel pra label-md (peso 600 real, ver abaixo) sem baixar um peso novo so pra isso.
  interSemiBold: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
  interExtraBold: 'Inter_800ExtraBold', // usado tambem onde o HTML pede peso 900 (font-black) — 900 nao esta entre os pesos carregados, 800 e o mais proximo disponivel.
} as const;

export const typography3 = {
  displayLg: {
    fontFamily: fonts3.interBold,
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -0.96,
    color: colors3.onSurface,
  },
  headlineLg: {
    fontFamily: fonts3.interBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.32,
    color: colors3.onSurface,
  },
  headlineLgMobile: {
    fontFamily: fonts3.interBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.28,
    color: colors3.onSurface,
  },
  headlineMd: {
    fontFamily: fonts3.interSemiBold,
    fontSize: 24,
    lineHeight: 32,
    color: colors3.onSurface,
  },
  bodyLg: {
    fontFamily: fonts3.interRegular,
    fontSize: 18,
    lineHeight: 28,
    color: colors3.onSurface,
  },
  bodyMd: {
    fontFamily: fonts3.interRegular,
    fontSize: 16,
    lineHeight: 24,
    color: colors3.onSurface,
  },
  labelMd: {
    fontFamily: fonts3.interSemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.28,
    color: colors3.onSurface,
  },
  labelSm: {
    fontFamily: fonts3.interMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.48,
    color: colors3.onSurfaceVariant,
  },
} as const;

/**
 * RN nao suporta multiplas camadas de box-shadow — aproximacao de 1 camada
 * so pras 2 sombras do HTML (`shadow-glass`/`shadow-glass-lg`, ambas com 2
 * camadas sobrepostas de preto bem sutil). Ver GlassCard.tsx.
 */
export const shadows3 = {
  glass: { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 24 },
  glassLg: { shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.07, shadowRadius: 32 },
} as const;

export const theme3 = { colors: colors3, spacing: spacing3, radius: radius3, typography: typography3, shadows: shadows3 };
