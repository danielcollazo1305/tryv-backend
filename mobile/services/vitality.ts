// Logica PURA do monitor de Vitalidade (Treino): estado e rotulo pelo final_score, cor continua, contraste e forma da onda. Sem React nem
// imports do app, para ser testada direto em Node (ver Claude outputs/try_vitalidade_app.mjs).

export type VitalityState = 'fit' | 'attention' | 'recover' | 'nodata';

export interface VitalityReadiness {
  final_score: number | null | undefined;
  sleep_score: number | null | undefined;
  hr_score: number | null | undefined;
}

export const VITALITY_LABELS: Record<VitalityState, string> = {
  fit: 'Em forma',
  attention: 'Atenção',
  recover: 'Recuperar',
  nodata: 'Sem dados',
};

export const VITALITY_NO_DATA_MESSAGE = 'Conecte o Apple Health ou o Health Connect';

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/** 70-100 em forma, 40-69 atencao, 0-39 recuperar. Score ausente ou NaN = sem dados (nunca vira faixa nem cor). */
export function scoreToState(score: number | null | undefined): VitalityState {
  if (!isNum(score)) return 'nodata';
  const s = clampScore(score);
  if (s >= 70) return 'fit';
  if (s >= 40) return 'attention';
  return 'recover';
}

/** "Sem dados" = sono E frequencia cardiaca ambos ausentes (so a carga de treino nao basta) ou score invalido. */
export function readinessToState(readiness: VitalityReadiness | null | undefined): VitalityState {
  if (!readiness) return 'nodata';
  if (!isNum(readiness.final_score)) return 'nodata';
  if (!isNum(readiness.sleep_score) && !isNum(readiness.hr_score)) return 'nodata';
  return scoreToState(readiness.final_score);
}

// ------------------------------------------------------------------------------------------------------------------------------- cor
// Interpolacao em HSL (matiz/saturacao/luminosidade) entre pontos fixos: passar por RGB faria laranja->verde virar marrom-oliva.
// Luminosidade baixa o bastante para a linha ter contraste de 3:1 sobre o painel claro (testado).
interface Hsl {
  h: number;
  s: number;
  l: number;
}
const STOPS: { at: number; hsl: Hsl }[] = [
  { at: 0, hsl: { h: 0, s: 75, l: 45 } }, // vermelho
  { at: 40, hsl: { h: 27, s: 90, l: 44 } }, // laranja
  { at: 55, hsl: { h: 48, s: 85, l: 31 } }, // amarelo (mais escuro: amarelo claro nao tem contraste)
  { at: 70, hsl: { h: 78, s: 65, l: 33 } }, // verde-amarelado
  { at: 100, hsl: { h: 142, s: 65, l: 30 } }, // verde
];

function hslAt(score: number): Hsl {
  const s = clampScore(score);
  for (let i = 1; i < STOPS.length; i += 1) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (s <= b.at) {
      const t = (s - a.at) / (b.at - a.at);
      return { h: a.hsl.h + (b.hsl.h - a.hsl.h) * t, s: a.hsl.s + (b.hsl.s - a.hsl.s) * t, l: a.hsl.l + (b.hsl.l - a.hsl.l) * t };
    }
  }
  return STOPS[STOPS.length - 1].hsl;
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** Cor do score: 100 verde, 70 verde-amarelado, 40 laranja, 0 vermelho. Fora de 0-100 faz clamp; NaN/ausente = null (sem cor). */
export function scoreToColor(score: number | null | undefined): string | null {
  if (!isNum(score)) return null;
  const { h, s, l } = hslAt(score);
  return hslToHex(h, s, l);
}

/** Fundo claro do painel: mesma matiz do score, bem clara. */
export function scoreToPanelTint(score: number | null | undefined): string | null {
  if (!isNum(score)) return null;
  const { h } = hslAt(score);
  return hslToHex(h, 70, 94);
}

/** Fundo da pilula do rotulo: mesma matiz, escuro, para texto branco passar de 4,5:1. */
export function scoreToPillColor(score: number | null | undefined): string | null {
  if (!isNum(score)) return null;
  const { h, s } = hslAt(score);
  return hslToHex(h, s, 26);
}

// ------------------------------------------------------------------------------------------------------------------------ contraste (WCAG)
function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ------------------------------------------------------------------------------------------------------------------------------- onda
// Onda tipo eletrocardiograma em um periodo de `width` x `height`; o componente repete o periodo e desliza a linha (loop sem emenda,
// pois o periodo comeca e termina na linha de base).
const BEAT = [
  [0, 0],
  [0.1, 0],
  [0.16, -0.12],
  [0.22, 0],
  [0.3, 0],
  [0.34, 0.14],
  [0.4, -1],
  [0.46, 0.32],
  [0.52, 0],
  [0.62, 0],
  [0.7, -0.22],
  [0.78, 0],
  [1, 0],
] as const;

interface BeatPlan {
  start: number; // fracao do periodo
  span: number; // fracao do periodo ocupada pelo batimento
  amp: number; // 0-1 da amplitude maxima
}

const PLANS: Record<VitalityState, BeatPlan[]> = {
  fit: [
    { start: 0.0, span: 0.33, amp: 1 },
    { start: 0.33, span: 0.33, amp: 1 },
    { start: 0.66, span: 0.34, amp: 1 },
  ],
  attention: [
    { start: 0.02, span: 0.22, amp: 0.55 },
    { start: 0.3, span: 0.26, amp: 0.34 },
    { start: 0.6, span: 0.2, amp: 0.62 },
    { start: 0.86, span: 0.14, amp: 0.28 },
  ],
  recover: [{ start: 0.3, span: 0.4, amp: 0.12 }],
  nodata: [],
};

/** Caminho SVG ("M x y L x y ...") de `repeat` periodos. Linha de base em 60% da altura, para o pico (R) ter mais espaco. */
export function waveformPath(state: VitalityState, width: number, height: number, repeat = 2): string {
  const base = height * 0.6;
  const amplitude = height * 0.55;
  const plans = PLANS[state];
  const pts: string[] = [];
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  for (let p = 0; p < repeat; p += 1) {
    const ox = p * width;
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${fmt(ox)} ${fmt(base)}`);
    for (const plan of plans) {
      for (const [bx, by] of BEAT) {
        pts.push(`L${fmt(ox + (plan.start + bx * plan.span) * width)} ${fmt(base + by * amplitude * plan.amp)}`);
      }
    }
    pts.push(`L${fmt(ox + width)} ${fmt(base)}`);
  }
  return pts.join(' ');
}

// ------------------------------------------------------------------------------------------------------------------------ acessibilidade
function scoreText(score: number | null | undefined): string {
  return isNum(score) ? `${Math.round(clampScore(score))} de 100` : 'sem dado';
}

/** Rotulo unico lido pelo leitor de tela: estado, pontuacao, sono, carga e FC. */
export function vitalityAccessibilityLabel(state: VitalityState, readiness: (VitalityReadiness & { load_score?: number | null }) | null): string {
  if (state === 'nodata') return `Vitalidade: sem dados. ${VITALITY_NO_DATA_MESSAGE}.`;
  const r = readiness;
  return `Vitalidade: ${VITALITY_LABELS[state]}. Pontuação ${scoreText(r?.final_score)}. Sono ${scoreText(r?.sleep_score)}. Carga ${scoreText(
    r?.load_score
  )}. Frequência cardíaca ${scoreText(r?.hr_score)}.`;
}
