import type { Slug } from 'react-native-body-highlighter';

/**
 * Lookup exercicio -> grupos musculares (+ video de execucao, item 2).
 *
 * DECISAO (item 1 do pedido, opcao "a" em vez de "b"): os exercicios do
 * plano de treino sao texto livre gerado por IA (POST /workout-plans/
 * generate) sem nenhum campo estruturado de grupo muscular. Em vez de
 * mudar o prompt/schema da geracao por IA no backend (opcao "b" —
 * mexeria em logica de geracao, fora do escopo "so visual" e um risco
 * maior sem necessidade clara agora), optei por uma tabela de referencia
 * no frontend, casada por PALAVRA-CHAVE (nao nome exato) contra o nome do
 * exercicio — mais tolerante a variacoes tipo "Supino Reto com Barra" vs
 * "Supino Reto" vs "Supino Reto Halteres", que um match exato perderia.
 * Comparacao ignora acentuacao/caixa (ver normalize()), entao as
 * keywords abaixo podem ser escritas com acento normal.
 *
 * LIMITACAO CONHECIDA (documentada conforme pedido): cobre o vocabulario
 * comum de exercicios de academia em portugues (~30 padroes). Um
 * exercicio com nome muito especifico/atipico que a IA gerar e nao bater
 * com nenhuma palavra-chave simplesmente nao contribui com nenhum
 * destaque no diagrama — nao trava, nao quebra, so nao ilumina nada
 * extra pra aquele exercicio especifico.
 *
 * videoUrl: sempre undefined hoje (nenhum video gravado ainda, ver item 2
 * do pedido) — campo pronto pra quando existir uma biblioteca real de
 * videos por exercicio.
 */
export interface ExerciseLibraryEntry {
  keywords: string[];
  muscles: Slug[];
  videoUrl?: string;
}

export const EXERCISE_LIBRARY: ExerciseLibraryEntry[] = [
  { keywords: ['supino'], muscles: ['chest', 'triceps', 'deltoids'] },
  { keywords: ['crucifixo', 'peck deck', 'crossover'], muscles: ['chest'] },
  { keywords: ['flexão', 'flexao de braço', 'push up', 'push-up'], muscles: ['chest', 'triceps'] },
  { keywords: ['desenvolvimento'], muscles: ['deltoids', 'triceps'] },
  { keywords: ['elevação lateral'], muscles: ['deltoids'] },
  { keywords: ['elevação frontal'], muscles: ['deltoids'] },
  { keywords: ['remada'], muscles: ['upper-back', 'biceps'] },
  { keywords: ['puxada', 'pulldown', 'pull down'], muscles: ['upper-back', 'biceps'] },
  { keywords: ['barra fixa', 'pull up', 'pull-up'], muscles: ['upper-back', 'biceps'] },
  { keywords: ['face pull'], muscles: ['trapezius', 'deltoids'] },
  { keywords: ['encolhimento', 'shrug'], muscles: ['trapezius'] },
  { keywords: ['levantamento terra', 'terra'], muscles: ['lower-back', 'hamstring', 'gluteal'] },
  { keywords: ['agachamento', 'squat'], muscles: ['quadriceps', 'gluteal', 'hamstring'] },
  { keywords: ['leg press'], muscles: ['quadriceps', 'gluteal'] },
  { keywords: ['cadeira extensora', 'extensora'], muscles: ['quadriceps'] },
  { keywords: ['mesa flexora', 'cadeira flexora', 'flexora'], muscles: ['hamstring'] },
  { keywords: ['stiff'], muscles: ['hamstring', 'gluteal'] },
  { keywords: ['afundo', 'lunge', 'passada'], muscles: ['quadriceps', 'gluteal'] },
  { keywords: ['panturrilha', 'calf', 'gêmeos'], muscles: ['calves'] },
  { keywords: ['rosca'], muscles: ['biceps'] },
  { keywords: ['tríceps', 'triceps'], muscles: ['triceps'] },
  { keywords: ['abdominal', 'crunch', 'prancha', 'plank'], muscles: ['abs'] },
  { keywords: ['oblíquo'], muscles: ['obliques'] },
  { keywords: ['glúteo', 'hip thrust', 'elevação pélvica'], muscles: ['gluteal'] },
  { keywords: ['adutor', 'adução'], muscles: ['adductors'] },
  { keywords: ['abdutor', 'abdução'], muscles: ['gluteal'] },
  { keywords: ['elevação de pernas', 'infra'], muscles: ['abs'] },
  { keywords: ['voador'], muscles: ['chest'] },
  { keywords: ['pullover'], muscles: ['chest', 'upper-back'] },
];

/** Remove acentos e caixa alta pra comparar por palavra-chave de forma tolerante. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function getExerciseInfo(exerciseName: string): ExerciseLibraryEntry | null {
  const normalized = normalize(exerciseName);
  return (
    EXERCISE_LIBRARY.find((entry) => entry.keywords.some((keyword) => normalized.includes(normalize(keyword)))) ??
    null
  );
}

/** Grupos musculares unicos trabalhados no dia (uniao dos exercicios reconhecidos, sem duplicar). */
export function getDayMuscleGroups(exerciseNames: string[]): Slug[] {
  const slugs = new Set<Slug>();
  exerciseNames.forEach((name) => {
    const info = getExerciseInfo(name);
    info?.muscles.forEach((slug) => slugs.add(slug));
  });
  return Array.from(slugs);
}
