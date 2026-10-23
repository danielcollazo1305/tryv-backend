// Tela "Musculos" (M3): logica PURA (sem React Native, sem rede), testada no Node (Claude outputs/try_musculos_app.mjs).
// Fonte unica dos numeros: GET /dashboard/exercise-volume (series CONCLUIDAS por exercicio, so do usuario logado, janela em dias locais). O servidor
// nao devolve musculo: o app converte exercicio -> musculos pela biblioteca (constants/exerciseLibrary.ts, via `resolver`) e soma as series.
//
// REGRA DE CONTAGEM (documentada na tela): uma serie conta INTEIRA em cada musculo que o exercicio trabalha. Ex.: 4 series de Supino Reto
// (peito, triceps, ombros) = 4 em Peito, 4 em Triceps e 4 em Ombros. Por isso a soma dos musculos pode passar do total de series do periodo.
// Exercicio que a biblioteca nao reconhece NAO some: vai para "Nao classificados", para o total nunca parecer menor sem explicacao.

export type PeriodDays = 7 | 30 | 90;
export const PERIOD_OPTIONS: { days: PeriodDays; label: string }[] = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];
export const DEFAULT_PERIOD: PeriodDays = 30;

export const COUNT_RULE_NOTE =
  'Cada série conta inteira em todos os músculos do exercício. Por isso a soma dos músculos pode ser maior que o total de séries do período.';

// ------------------------------------------------------------------------------------------------------------------ janela
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DD" no dia LOCAL do aparelho (mesma conta que o app ja usa nas outras telas: ano, mes e dia locais, sem passar por UTC). */
export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Janela de `days` dias terminando HOJE (inclusivo nos dois extremos, como o servidor): 30 dias = hoje e os 29 dias anteriores. */
export function periodWindow(days: number, now: Date = new Date()): { start_date: string; end_date: string } {
  const n = Number.isFinite(days) && days >= 1 ? Math.floor(days) : DEFAULT_PERIOD;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1));
  return { start_date: toLocalDateKey(start), end_date: toLocalDateKey(end) };
}

// ----------------------------------------------------------------------------------------------------------- payload do servidor
export interface ExerciseVolumeItem {
  exercise_name: string;
  sets_count: number;
  sessions_count: number;
}

export interface ExerciseVolumeData {
  start_date: string;
  end_date: string;
  total_sets: number;
  total_sessions: number;
  exercises: ExerciseVolumeItem[];
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** Resposta de GET /dashboard/exercise-volume -> dados seguros (itens invalidos saem; formato errado = null). */
export function normalizeExerciseVolume(raw: unknown): ExerciseVolumeData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.exercises)) return null;
  const exercises: ExerciseVolumeItem[] = [];
  for (const item of r.exercises) {
    const it = (item ?? {}) as Record<string, unknown>;
    const sets = count(it.sets_count);
    const name = typeof it.exercise_name === 'string' ? it.exercise_name.trim() : '';
    if (sets === null || sets === 0 || name === '') continue;
    exercises.push({ exercise_name: name, sets_count: sets, sessions_count: count(it.sessions_count) ?? 0 });
  }
  const totalFromItems = exercises.reduce((sum, e) => sum + e.sets_count, 0);
  return {
    start_date: typeof r.start_date === 'string' ? r.start_date : '',
    end_date: typeof r.end_date === 'string' ? r.end_date : '',
    total_sets: count(r.total_sets) ?? totalFromItems,
    total_sessions: count(r.total_sessions) ?? 0,
    exercises,
  };
}

// ---------------------------------------------------------------------------------------------------------------- musculos
const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Peito',
  triceps: 'Tríceps',
  biceps: 'Bíceps',
  deltoids: 'Ombros',
  'upper-back': 'Costas',
  'lower-back': 'Lombar',
  trapezius: 'Trapézio',
  forearm: 'Antebraço',
  abs: 'Abdômen',
  obliques: 'Oblíquos',
  quadriceps: 'Quadríceps',
  hamstring: 'Posterior de coxa',
  gluteal: 'Glúteos',
  adductors: 'Adutores',
  calves: 'Panturrilha',
};

/** Nome do musculo em portugues; identificador desconhecido aparece como esta (nunca quebra). */
export function muscleLabel(slug: string): string {
  return MUSCLE_LABELS[slug] ?? slug;
}

/** Exercicio -> identificadores de musculo (biblioteca), ou null/vazio se nao reconhece. Injetado para o modulo ficar sem dependencias. */
export type MuscleResolver = (exerciseName: string) => readonly string[] | null | undefined;

export interface MuscleRow {
  slug: string;
  label: string;
  sets: number;
  /** Quantos exercicios diferentes contribuiram. */
  exercises: number;
}

export interface UnclassifiedExercise {
  name: string;
  sets: number;
}

export interface MuscleVolumeResult {
  /** Por musculo, mais series primeiro (empate: ordem alfabetica do nome em portugues). */
  muscles: MuscleRow[];
  /** Exercicios que a biblioteca nao reconheceu, mais series primeiro. */
  unclassified: UnclassifiedExercise[];
  /** Total de series do periodo (o do servidor). */
  totalSets: number;
  /** Series dos exercicios reconhecidos / nao reconhecidos (cada serie conta UMA vez aqui; classified + unclassified = soma dos exercicios). */
  classifiedSets: number;
  unclassifiedSets: number;
  totalSessions: number;
  hasData: boolean;
}

/** Soma as series por musculo (regra: a serie inteira em cada musculo do exercicio). Ver o cabecalho do arquivo. */
export function buildMuscleVolume(data: ExerciseVolumeData, resolver: MuscleResolver): MuscleVolumeResult {
  const bySlug = new Map<string, { sets: number; exercises: number }>();
  const unclassified: UnclassifiedExercise[] = [];
  let classifiedSets = 0;
  let unclassifiedSets = 0;
  for (const item of data.exercises) {
    const slugs = [...new Set((resolver(item.exercise_name) ?? []).filter((s) => typeof s === 'string' && s !== ''))];
    if (slugs.length === 0) {
      unclassified.push({ name: item.exercise_name, sets: item.sets_count });
      unclassifiedSets += item.sets_count;
      continue;
    }
    classifiedSets += item.sets_count;
    for (const slug of slugs) {
      const cur = bySlug.get(slug) ?? { sets: 0, exercises: 0 };
      cur.sets += item.sets_count;
      cur.exercises += 1;
      bySlug.set(slug, cur);
    }
  }
  const muscles = [...bySlug.entries()]
    .map(([slug, v]) => ({ slug, label: muscleLabel(slug), sets: v.sets, exercises: v.exercises }))
    .sort((a, b) => b.sets - a.sets || a.label.localeCompare(b.label, 'pt-BR'));
  unclassified.sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name, 'pt-BR'));
  return {
    muscles,
    unclassified,
    totalSets: data.total_sets,
    classifiedSets,
    unclassifiedSets,
    totalSessions: data.total_sessions,
    hasData: data.exercises.length > 0,
  };
}

export const INTENSITY_LEVELS = 4;

/** Nivel de cor (1 a 4) de um musculo no diagrama, proporcional ao que mais teve series no periodo. */
export function intensityFor(sets: number, maxSets: number): number {
  if (!(sets > 0) || !(maxSets > 0)) return 1;
  return Math.min(INTENSITY_LEVELS, Math.max(1, Math.ceil((sets / maxSets) * INTENSITY_LEVELS)));
}

/** Dados do diagrama (identificador + nivel de cor) a partir das linhas. */
export function diagramData(rows: MuscleRow[]): { slug: string; intensity: number }[] {
  const max = rows.reduce((m, r) => Math.max(m, r.sets), 0);
  return rows.map((r) => ({ slug: r.slug, intensity: intensityFor(r.sets, max) }));
}

/** Largura (0 a 1) da barra de uma linha, proporcional ao musculo com mais series. */
export function barFraction(sets: number, maxSets: number): number {
  if (!(sets > 0) || !(maxSets > 0)) return 0;
  return Math.min(1, sets / maxSets);
}

/** "12 séries" / "1 série". */
export function setsText(n: number): string {
  return n === 1 ? '1 série' : `${n} séries`;
}
