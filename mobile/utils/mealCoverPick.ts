// Escolha da capa de uma refeicao SEM foto, pelas palavras da descricao. Logica pura (sem require de imagem): quem liga o nome ao arquivo e
// constants/mealCovers.ts. Devolve o nome de um arquivo de capa ou null (null = o app mostra o prato roxo, MealCoverArt).

/** Nomes das capas que EXISTEM em assets/meal-covers/<tema>/ (sem extensao). Adicionou imagem nova? Entre aqui, em mealCovers.ts e numa regra. */
export type MealCoverName = 'bife' | 'bife_ovo' | 'frango_legumes' | 'file_mignon' | 'salmao' | 'peixe_assado' | 'poke';

/** Minusculas, sem acento. */
export function normalizeMealText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Palavras inteiras (so letras e numeros): "bife" nao casa com "bifes"/"bifinho"; "salada de atum" -> [salada, de, atum]. */
function words(text: string): Set<string> {
  return new Set(normalizeMealText(text).split(/[^a-z0-9]+/).filter(Boolean));
}

/**
 * BLOQUEIO: pratos que AINDA NAO TEM imagem. Se a descricao tiver uma destas palavras, nao ha capa (null -> prato roxo), mesmo que tenha
 * "frango" ou "bife" ("strogonoff de frango" nao pode virar frango com legumes). Quando uma imagem nova for adicionada, tire a palavra
 * daqui e crie a regra em RULES.
 */
export const BLOCKED_WORDS: readonly string[] = [
  'strogonoff',
  'feijoada',
  'moqueca',
  'lasanha',
  'macarrao',
  'espaguete',
  'massa',
  'churrasco',
  'espetinho',
];

interface Rule {
  /** Todas estas palavras precisam estar na descricao... */
  all?: readonly string[];
  /** ...e pelo menos uma destas (se informado). */
  any?: readonly string[];
  cover: MealCoverName;
}

// ORDEM = prioridade (a primeira que casar vence). O bloqueio roda DEPOIS de "bife"+"ovo" e "mignon" e ANTES das demais (ver pickMealCover).
const BEFORE_BLOCK: readonly Rule[] = [
  { all: ['bife', 'ovo'], cover: 'bife_ovo' },
  { any: ['mignon'], cover: 'file_mignon' },
];
const AFTER_BLOCK: readonly Rule[] = [
  { any: ['salmao'], cover: 'salmao' },
  { any: ['peixe', 'tilapia', 'pescada'], cover: 'peixe_assado' },
  { any: ['poke', 'atum'], cover: 'poke' },
  { any: ['frango'], cover: 'frango_legumes' },
  { any: ['bife'], cover: 'bife' },
];

function matches(rule: Rule, found: Set<string>): boolean {
  if (rule.all && !rule.all.every((w) => found.has(w))) return false;
  if (rule.any && !rule.any.some((w) => found.has(w))) return false;
  return true;
}

/** Nome da capa para a descricao, ou null (sem regra que case, ou prato bloqueado) -> prato roxo. */
export function pickMealCover(description: string | null | undefined): MealCoverName | null {
  if (!description) return null;
  const found = words(description);
  for (const rule of BEFORE_BLOCK) if (matches(rule, found)) return rule.cover;
  if (BLOCKED_WORDS.some((w) => found.has(w))) return null;
  for (const rule of AFTER_BLOCK) if (matches(rule, found)) return rule.cover;
  return null;
}

/** Conjunto fixo do DayCard (sem "poke"): a capa do dia e escolhida pela data, sempre a mesma para o mesmo dia. */
export const DAY_COVER_SET: readonly MealCoverName[] = ['bife', 'frango_legumes', 'file_mignon', 'salmao', 'peixe_assado', 'bife_ovo'];

/** Deterministica por data 'YYYY-MM-DD' (numero do dia mod tamanho do conjunto): dias seguidos mudam de capa. Data invalida -> a primeira. */
export function dayCoverFor(date: string): MealCoverName {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return DAY_COVER_SET[0];
  const dayNumber = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  return DAY_COVER_SET[((dayNumber % DAY_COVER_SET.length) + DAY_COVER_SET.length) % DAY_COVER_SET.length];
}
