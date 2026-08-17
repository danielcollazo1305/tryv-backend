/**
 * Calculos de saude do onboarding expandido (meta calorica sugerida +
 * estimativa de tempo pro objetivo) — funcoes puras, sem chamada de API,
 * pra ficarem faceis de auditar (isso e dado de saude, nao pode ser um
 * numero magico sem formula rastreavel por tras).
 */

export type BiologicalSexForCalc = 'masculino' | 'feminino';
export type OnboardingGoal = 'emagrecer' | 'massa' | 'manter' | 'condicionamento';
export type ActivityLevel = 'sedentario' | 'leve' | 'moderado' | 'intenso';

/** Valor generico usado quando nao da pra calcular com confianca (sexo "prefiro nao informar" ou dados de Corpo ausentes). */
export const GENERIC_CALORIE_FALLBACK = 2000;

/** ~7700 kcal por kg de gordura corporal — aproximacao padrao comumente usada nesse tipo de estimativa (nao e um valor cientificamente exato, e uma referencia amplamente adotada em calculadoras de emagrecimento). */
const KCAL_PER_KG_FAT = 7700;

/** Idade calculada a partir da data de nascimento (nunca guardamos um numero de idade fixo, que ficaria desatualizado). */
export function calculateAge(dateOfBirthIso: string): number {
  const dob = new Date(dateOfBirthIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Nivel de atividade a partir da frequencia REAL de treino + cardio
 * semanal coletada no onboarding (em vez de um fator generico chutado).
 * Faixas (documentadas, ajustaveis): 0 sessoes = sedentario, 1-2 = leve,
 * 3-4 = moderado, 5+ = intenso — mesmas faixas sugeridas no pedido,
 * somando treino de forca + cardio como "sessoes totais da semana".
 */
export function getActivityLevel(trainingSessionsPerWeek: number, cardioSessionsPerWeek: number): ActivityLevel {
  const total = trainingSessionsPerWeek + cardioSessionsPerWeek;
  if (total <= 0) return 'sedentario';
  if (total <= 2) return 'leve';
  if (total <= 4) return 'moderado';
  return 'intenso';
}

/** Multiplicadores padrao de fator de atividade (mesma tabela usada por praticamente toda calculadora de TDEE baseada em Harris-Benedict/Mifflin-St Jeor). */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
};

/**
 * Taxa metabolica basal — formula de Mifflin-St Jeor (Mifflin MD, St Jeor
 * ST, et al. "A new predictive equation for resting energy expenditure in
 * healthy individuals." Am J Clin Nutr, 1990) — a mais usada atualmente
 * pra essa estimativa, e a que o pedido explicitamente sugeriu por nao
 * exigir dado que o app nao coleta (ex: %BF preciso via DEXA).
 *   Homens:   10*peso(kg) + 6.25*altura(cm) - 5*idade + 5
 *   Mulheres: 10*peso(kg) + 6.25*altura(cm) - 5*idade - 161
 */
export function calculateBmr(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  biologicalSex: BiologicalSexForCalc;
}): number {
  const base = 10 * params.weightKg + 6.25 * params.heightCm - 5 * params.age;
  return params.biologicalSex === 'masculino' ? base + 5 : base - 161;
}

export function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

/**
 * Ajuste calorico por objetivo — valores a criterio (documentados):
 * emagrecer = deficit de 20% (dentro da faixa moderada/sustentavel
 * tipicamente recomendada, 15-25%); massa = superavit leve de 10% (evita
 * ganho excessivo de gordura junto do musculo); manter/condicionamento =
 * neutro (nenhum dos dois tem uma direcao calorica inerente).
 */
const GOAL_ADJUSTMENT: Record<OnboardingGoal, number> = {
  emagrecer: 0.8,
  massa: 1.1,
  manter: 1.0,
  condicionamento: 1.0,
};

export function calculateSuggestedCalorieGoal(tdee: number, goal: OnboardingGoal): number {
  return Math.round(tdee * GOAL_ADJUSTMENT[goal]);
}

export interface SuggestedCalorieInfo {
  value: number;
  isGeneric: boolean;
  /** null quando isGeneric (fallback generico nao passa por TDEE nenhum). */
  tdee: number | null;
}

/**
 * Junta idade + BMR + TDEE + ajuste por objetivo num so lugar, com o
 * fallback generico (item 5 do pedido) quando faltar algum dado obrigatorio
 * ou o sexo biologico for "prefiro nao informar". Extraida como funcao
 * unica pra nao duplicar essa cadeia de calculo entre o passo de Meta
 * Calorica (que a mostra) e o passo de Estimativa de Tempo (que reusa o
 * mesmo TDEE, ver calculateGoalTimeEstimate).
 */
export function calculateSuggestedCalorieInfo(params: {
  weightKg: number;
  heightCm: number;
  dateOfBirthIso: string | null;
  biologicalSex: BiologicalSexForCalc | 'prefiro_nao_informar' | null;
  trainingSessionsPerWeek: number;
  cardioSessionsPerWeek: number;
  goal: OnboardingGoal;
}): SuggestedCalorieInfo {
  const canCalculate =
    params.weightKg > 0 &&
    params.heightCm > 0 &&
    !!params.dateOfBirthIso &&
    (params.biologicalSex === 'masculino' || params.biologicalSex === 'feminino');

  if (!canCalculate) {
    return { value: GENERIC_CALORIE_FALLBACK, isGeneric: true, tdee: null };
  }

  const age = calculateAge(params.dateOfBirthIso as string);
  const bmr = calculateBmr({
    weightKg: params.weightKg,
    heightCm: params.heightCm,
    age,
    biologicalSex: params.biologicalSex as BiologicalSexForCalc,
  });
  const activityLevel = getActivityLevel(params.trainingSessionsPerWeek, params.cardioSessionsPerWeek);
  const tdee = calculateTdee(bmr, activityLevel);
  const value = calculateSuggestedCalorieGoal(tdee, params.goal);
  return { value, isGeneric: false, tdee };
}

export interface GoalTimeEstimateInput {
  currentWeightKg: number;
  currentBodyFatPercentage: number | null;
  targetBodyFatPercentage: number | null;
  targetWeightKg: number | null;
  dailyCalorieGoal: number;
  tdee: number;
  goal: OnboardingGoal;
}

export interface GoalTimeEstimateResult {
  weeks: number;
  months: number;
  magnitudeKg: number;
  wantsToLose: boolean;
}

/**
 * Estimativa de tempo pro objetivo (so calculada quando ha meta
 * especifica). Retorna null quando o calculo nao e confiavel (deficit/
 * superavit zero, ou sinal incompativel com o objetivo — ver protecao no
 * pedido, item 4.5) — o chamador deve mostrar uma mensagem alternativa
 * nesse caso, nunca um numero absurdo.
 */
export function calculateGoalTimeEstimate(input: GoalTimeEstimateInput): GoalTimeEstimateResult | null {
  let magnitudeKg: number;
  let wantsToLose: boolean;

  if (input.targetWeightKg != null) {
    wantsToLose = input.targetWeightKg < input.currentWeightKg;
    magnitudeKg = Math.abs(input.currentWeightKg - input.targetWeightKg);
  } else if (input.targetBodyFatPercentage != null && input.currentBodyFatPercentage != null) {
    wantsToLose = input.targetBodyFatPercentage < input.currentBodyFatPercentage;
    magnitudeKg =
      (Math.abs(input.currentBodyFatPercentage - input.targetBodyFatPercentage) / 100) * input.currentWeightKg;
  } else {
    return null;
  }

  if (magnitudeKg <= 0) return null;

  // Deficit/superavit semanal = a MESMA base de calculo da meta calorica
  // (dailyCalorieGoal vs. tdee), so extraindo o resultado dela -- nao soma
  // o fator de atividade de novo (ele ja esta embutido no tdee).
  const weeklyDelta = (input.dailyCalorieGoal - input.tdee) * 7;

  // Protecao (item 4.5): deficit/superavit zero, ou sinal incompativel
  // com o objetivo (ex: quer perder mas o calculo deu superavit) -- nao
  // deveria acontecer dado a logica do passo anterior, mas protegido
  // mesmo assim, sem gerar tempo infinito/negativo.
  const isConsistent = wantsToLose ? weeklyDelta < 0 : weeklyDelta > 0;
  if (!isConsistent) return null;

  const weeks = (magnitudeKg * KCAL_PER_KG_FAT) / Math.abs(weeklyDelta);
  return {
    weeks: Math.round(weeks),
    months: Math.round((weeks / 4.345) * 10) / 10,
    magnitudeKg: Math.round(magnitudeKg * 10) / 10,
    wantsToLose,
  };
}
