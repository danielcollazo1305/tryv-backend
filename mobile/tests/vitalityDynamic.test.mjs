// Testes da Vitalidade dinamica (services/vitalityDynamic.ts): bordas e estabilidade. Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BASE_WEIGHTS,
  FALLBACK_REFERENCES,
  K,
  SLEEP_NEUTRAL,
  VITALITY_DYNAMIC_THRESHOLDS,
  applyWear,
  dayTrainingUnits,
  dayWear,
  displayedVitality,
  dynamicScoreToState,
  freezeMorningBase,
  heartRateWear,
  median,
  monotonicDay,
  morningBase,
  movementWear,
  nonWorkoutMovement,
  personalReferences,
  recoveryPoints,
  smoothVitality,
  trainingWear,
  vitalityNow,
  workoutKcal,
  workoutUnits,
} from '../services/vitalityDynamic.ts';

const near = (actual, expected, eps = 0.05, msg = '') => assert.ok(Math.abs(actual - expected) <= eps, `${msg} esperado ~${expected}, veio ${actual}`);
const REFS = { steps: 6000, kcal: 300, eref: 60, fromHistory: { steps: true, kcal: true, eref: true } };
const day = (over = {}) => ({ steps: 0, activeKcal: 0, workouts: [], awakeHrElevation: 0, restHours: 0, napMinutes: 0, ...over });
// PRNG deterministico (LCG) para os testes de propriedade.
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// ------------------------------------------------------------------------------------------------------------------------------- constantes
test('constantes do plano aprovado', () => {
  assert.deepEqual({ ...BASE_WEIGHTS }, { sleep: 0.65, load: 0.2, hr: 0.15 });
  near(BASE_WEIGHTS.sleep + BASE_WEIGHTS.load + BASE_WEIGHTS.hr, 1, 1e-9);
  assert.equal(SLEEP_NEUTRAL, 70);
  assert.equal(K.maxDrop, 55);
  assert.deepEqual({ ...VITALITY_DYNAMIC_THRESHOLDS }, { fit: 65, attention: 40 });
  assert.deepEqual({ steps: FALLBACK_REFERENCES.steps, kcal: FALLBACK_REFERENCES.kcal, eref: FALLBACK_REFERENCES.eref }, { steps: 6000, kcal: 300, eref: 60 });
});

// ------------------------------------------------------------------------------------------------------------------------------- mediana
test('mediana: vazia, um valor, par, impar e ignora nao numericos', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 3]), 2);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([10, NaN, 2, null, 6]), 6);
  assert.equal(median([NaN, undefined]), null);
});

// ------------------------------------------------------------------------------------------------------------------------------- treino
test('unidades de treino: peso 0,5 a 2,0 pela intensidade e 1,0 quando a intensidade e desconhecida', () => {
  assert.equal(workoutUnits({ minutes: 60, avgHr: 60 }, 60, 190), 30); // FC media = repouso -> 0,5
  assert.equal(workoutUnits({ minutes: 60, avgHr: 190 }, 60, 190), 120); // FC media = maxima -> 2,0
  assert.equal(workoutUnits({ minutes: 60, avgHr: 250 }, 60, 190), 120); // acima da maxima: limitado
  assert.equal(workoutUnits({ minutes: 60, avgHr: 40 }, 60, 190), 30); // abaixo do repouso: limitado
  near(workoutUnits({ minutes: 60, avgHr: 125 }, 60, 190), 60 * (0.5 + 1.5 * 0.5), 1e-9); // meio da reserva
  assert.equal(workoutUnits({ minutes: 60 }, 60, 190), 60); // sem FC media
  assert.equal(workoutUnits({ minutes: 60, avgHr: 150 }, null, 190), 60); // sem FC de repouso
  assert.equal(workoutUnits({ minutes: 60, avgHr: 150 }, 190, 190), 60); // maxima <= repouso: sem divisao por zero
  assert.equal(workoutUnits({ minutes: 60, avgHr: 150 }, 200, 190), 60);
  assert.equal(workoutUnits({ minutes: 60, avgHr: 190 }, 60, NaN), 120); // maxima invalida volta a 190
  for (const bad of [0, -10, NaN, null, undefined]) assert.equal(workoutUnits({ minutes: bad, avgHr: 150 }, 60, 190), 0);
  assert.equal(workoutUnits(null, 60, 190), 0);
});

test('calorias do treino: informadas (inclusive 0) ou estimadas por minutos', () => {
  assert.equal(workoutKcal({ minutes: 60, activeKcal: 500 }), 500);
  assert.equal(workoutKcal({ minutes: 60, activeKcal: 0 }), 0);
  assert.equal(workoutKcal({ minutes: 60 }), 420);
  assert.equal(workoutKcal({ minutes: 60, activeKcal: -5 }), 420);
  assert.equal(workoutKcal({ minutes: 60, activeKcal: NaN }), 420);
  assert.equal(workoutKcal({ minutes: NaN }), 0);
});

// ------------------------------------------------------------------------------------------------------ movimento SEM treino (correcao)
test('movimento fora de treino: subtrai passos e calorias dos treinos, nunca abaixo de zero', () => {
  const m = nonWorkoutMovement({ steps: 8000, activeKcal: 700, workouts: [{ minutes: 50, steps: 3000, activeKcal: 400 }] });
  assert.deepEqual(m, { steps: 5000, kcal: 300 });
  assert.deepEqual(nonWorkoutMovement({ steps: 1000, activeKcal: 100, workouts: [{ minutes: 50, steps: 3000, activeKcal: 400 }] }), { steps: 0, kcal: 0 });
});

test('movimento fora de treino: total ausente continua ausente; passos de treino nao informados nao sao descontados; kcal sem dado e estimada', () => {
  assert.deepEqual(nonWorkoutMovement({ steps: null, activeKcal: null, workouts: [{ minutes: 30, steps: 2000 }] }), { steps: null, kcal: null });
  assert.deepEqual(nonWorkoutMovement({ steps: 6000, activeKcal: 500, workouts: [{ minutes: 30 }] }), { steps: 6000, kcal: 500 - 210 });
  assert.deepEqual(nonWorkoutMovement({ steps: 6000, activeKcal: 500, workouts: [] }), { steps: 6000, kcal: 500 });
  assert.deepEqual(nonWorkoutMovement({ steps: 6000, activeKcal: 500 }), { steps: 6000, kcal: 500 });
});

test('SEM CONTAGEM DUPLA: o mesmo movimento fora de treino pesa igual com ou sem o treino; o treino pesa so no termo de treino', () => {
  const withRun = day({ steps: 8000, activeKcal: 700, workouts: [{ minutes: 50, avgHr: 150, steps: 3000, activeKcal: 400 }] });
  const withoutRun = day({ steps: 5000, activeKcal: 300 });
  near(movementWear(withRun, REFS).wear, movementWear(withoutRun, REFS).wear, 1e-9);
  near(movementWear(withRun, REFS).ratio, movementWear(withoutRun, REFS).ratio, 1e-9);
  const wRun = dayWear(withRun, REFS, 60, 190);
  const wNo = dayWear(withoutRun, REFS, 60, 190);
  assert.equal(wNo.training, 0);
  assert.ok(wRun.training > 0);
  near(wRun.movement, wNo.movement, 1e-9);
  near(wRun.total - wNo.total, wRun.training, 1e-9);
});

test('adicionar um treino cujos passos e calorias JA estao nos totais nao aumenta o desgaste de movimento', () => {
  const base = day({ steps: 9000, activeKcal: 800 });
  const before = movementWear(base, REFS).wear;
  const after = movementWear({ ...base, workouts: [{ minutes: 40, steps: 4000, activeKcal: 500 }] }, REFS).wear;
  assert.ok(after < before, `${after} deveria ser menor que ${before}`);
});

// ------------------------------------------------------------------------------------------------------------------------ referencia pessoal
const hist = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ steps: 5000 + i * 100, activeKcal: 250, workouts: [], ...over }));

test('referencia pessoal: com menos de 5 dias com dado usa o fallback', () => {
  for (const h of [[], null, undefined, hist(4), [{ steps: null, activeKcal: null, workouts: [] }, ...hist(3)]]) {
    const r = personalReferences(h, 60);
    assert.equal(r.steps, 6000);
    assert.equal(r.kcal, 300);
    assert.equal(r.eref, 60);
    assert.deepEqual(r.fromHistory, { steps: false, kcal: false, eref: false });
  }
});

test('referencia pessoal: 5 dias bastam e usam a mediana; dias sem dado nao contam', () => {
  const r = personalReferences(hist(5), 60); // passos 5000..5400 -> mediana 5200; kcal 250
  assert.equal(r.steps, 5200);
  assert.equal(r.kcal, 250);
  assert.deepEqual(r.fromHistory, { steps: true, kcal: true, eref: false });
  const holes = personalReferences([...hist(5), { steps: null, activeKcal: null, workouts: [] }, { steps: null, activeKcal: null, workouts: [] }], 60);
  assert.equal(holes.steps, 5200);
});

test('referencia pessoal: limites 3000-14000 passos, 150-1200 kcal, 40-120 de Eref', () => {
  assert.equal(personalReferences(hist(14, { steps: 800, activeKcal: 20 }), 60).steps, 3000);
  assert.equal(personalReferences(hist(14, { steps: 800, activeKcal: 20 }), 60).kcal, 150);
  assert.equal(personalReferences(hist(14, { steps: 30000, activeKcal: 5000 }), 60).steps, 14000);
  assert.equal(personalReferences(hist(14, { steps: 30000, activeKcal: 5000 }), 60).kcal, 1200);
  const small = personalReferences(hist(6, { workouts: [{ minutes: 10 }] }), 60);
  assert.equal(small.eref, 40);
  const big = personalReferences(hist(6, { workouts: [{ minutes: 300 }] }), 60);
  assert.equal(big.eref, 120);
});

test('referencia pessoal: so os ultimos 14 dias contam', () => {
  const old = Array.from({ length: 10 }, () => ({ steps: 13000, activeKcal: 900, workouts: [] }));
  const recent = Array.from({ length: 14 }, () => ({ steps: 4000, activeKcal: 200, workouts: [] }));
  const r = personalReferences([...old, ...recent], 60);
  assert.equal(r.steps, 4000);
  assert.equal(r.kcal, 200);
});

test('referencia pessoal e calculada FORA de treino (mesma regra do dia de hoje)', () => {
  const days = Array.from({ length: 8 }, () => ({ steps: 11000, activeKcal: 700, workouts: [{ minutes: 55, steps: 6000, activeKcal: 450 }] }));
  const r = personalReferences(days, 52);
  assert.equal(r.steps, 5000); // 11000 - 6000
  assert.equal(r.kcal, 250); // 700 - 450
  assert.ok(r.fromHistory.eref);
});

test('Eref exige 3 dias COM treino e usa as unidades (intensidade) de cada dia', () => {
  const noWork = hist(10);
  assert.equal(personalReferences([...noWork, { steps: 5000, activeKcal: 250, workouts: [{ minutes: 60 }] }, { steps: 5000, activeKcal: 250, workouts: [{ minutes: 60 }] }], 60).fromHistory.eref, false);
  const three = [...noWork, ...Array.from({ length: 3 }, () => ({ steps: 5000, activeKcal: 250, workouts: [{ minutes: 60 }] }))];
  const r = personalReferences(three, 60);
  assert.equal(r.eref, 60);
  assert.equal(r.fromHistory.eref, true);
});

// ------------------------------------------------------------------------------------------------------------------------------- base
test('base da manha: pesos 0,65 / 0,20 / 0,15', () => {
  assert.equal(morningBase({ sleep: 80, load: 90, hr: 70 }).base, 80.5);
  assert.equal(morningBase({ sleep: 80, load: 90, hr: 70 }).partialSleep, false);
  assert.equal(morningBase({ sleep: 100, load: 100, hr: 100 }).base, 100);
  assert.equal(morningBase({ sleep: 0, load: 0, hr: 0 }).base, 0);
});

test('base: sono ausente vira 70 neutro (parcial); carga ou FC ausentes redistribuem; sem nada = null', () => {
  const r = morningBase({ sleep: null, load: 90, hr: 70 });
  assert.equal(r.base, 74); // (0,65*70 + 0,2*90 + 0,15*70)
  assert.equal(r.partialSleep, true);
  assert.equal(morningBase({ sleep: 80, load: null, hr: 70 }).base, 78.1); // (0,65*80 + 0,15*70) / 0,8
  assert.equal(morningBase({ sleep: 80, load: 90, hr: null }).base, 82.4); // (52 + 18) / 0,85
  assert.equal(morningBase({ sleep: 80, load: null, hr: null }).base, 80);
  assert.equal(morningBase({ sleep: null, load: 90, hr: null }).base, 74.7); // sono neutro + carga: (45,5 + 18) / 0,85
  assert.deepEqual(morningBase({ sleep: null, load: null, hr: null }), { base: null, partialSleep: true }); // nada e inventado
  assert.deepEqual(morningBase({}), { base: null, partialSleep: true });
  assert.deepEqual(morningBase(null), { base: null, partialSleep: true });
});

test('base: valores fora de 0-100 sao limitados e NaN conta como ausente', () => {
  assert.equal(morningBase({ sleep: 150, load: 150, hr: 150 }).base, 100);
  assert.equal(morningBase({ sleep: -20, load: -20, hr: -20 }).base, 0);
  assert.equal(morningBase({ sleep: NaN, load: 90, hr: 70 }).partialSleep, true);
  assert.equal(morningBase({ sleep: 80, load: NaN, hr: 70 }).base, 78.1);
});

// ------------------------------------------------------------------------------------------------------------------------------- desgaste
test('movimento: zero sem movimento, 10,5 num dia tipico, satura em 32', () => {
  assert.equal(movementWear(day(), REFS).wear, 0);
  near(movementWear(day({ steps: 6000, activeKcal: 300 }), REFS).wear, 32 * (1 - Math.exp(-0.4)), 1e-9);
  assert.ok(movementWear(day({ steps: 600000, activeKcal: 30000 }), REFS).wear <= 32);
  assert.ok(movementWear(day({ steps: 600000, activeKcal: 30000 }), REFS).wear > 31.9);
});

test('movimento: usa so a razao disponivel (passos OU calorias) e ignora referencia invalida', () => {
  const onlySteps = movementWear(day({ steps: 6000, activeKcal: null }), REFS);
  near(onlySteps.ratio, 1, 1e-9);
  const onlyKcal = movementWear(day({ steps: null, activeKcal: 600 }), REFS);
  near(onlyKcal.ratio, 2, 1e-9);
  assert.equal(movementWear(day({ steps: null, activeKcal: null }), REFS).wear, 0);
  assert.equal(movementWear(day({ steps: 6000, activeKcal: 300 }), { steps: 0, kcal: 0 }).wear, 0);
});

test('treino: 0 sem treino, 15,2 com 2·Eref, nunca chega a 24; Eref invalido usa o fallback', () => {
  assert.equal(trainingWear(0, 60), 0);
  near(trainingWear(120, 60), 24 * (1 - Math.exp(-1)), 1e-9);
  assert.ok(trainingWear(1e6, 60) <= 24 && trainingWear(1e6, 60) > 23.9);
  assert.equal(trainingWear(-50, 60), 0);
  assert.equal(trainingWear(120, 0), trainingWear(120, FALLBACK_REFERENCES.eref));
  assert.equal(trainingWear(120, NaN), trainingWear(120, FALLBACK_REFERENCES.eref));
});

test('FC no dia: 0 sem dado ou negativo, proporcional ate 25 bpm, teto 6', () => {
  for (const v of [null, undefined, NaN, 0, -5]) assert.equal(heartRateWear(v), 0);
  assert.equal(heartRateWear(12.5), 3);
  assert.equal(heartRateWear(25), 6);
  assert.equal(heartRateWear(80), 6);
});

test('desgaste total: soma das parcelas e teto de 55 pontos por dia', () => {
  const normal = dayWear(day({ steps: 6000, activeKcal: 300, awakeHrElevation: 12.5 }), REFS, 60, 190);
  near(normal.total, normal.movement + normal.training + normal.heartRate, 1e-9);
  const extreme = dayWear(
    day({ steps: 90000, activeKcal: 9000, awakeHrElevation: 80, workouts: [{ minutes: 600, avgHr: 190 }] }),
    REFS, 60, 190
  );
  assert.equal(extreme.total, 55); // 32 + 24 + 6 = 62 limitado
  assert.ok(extreme.movement + extreme.training + extreme.heartRate > 55);
});

test('unidades de treino do dia somam as sessoes', () => {
  assert.equal(dayTrainingUnits([{ minutes: 30 }, { minutes: 30 }], 60, 190), 60);
  assert.equal(dayTrainingUnits([], 60, 190), 0);
  assert.equal(dayTrainingUnits(null, 60, 190), 0);
});

// ------------------------------------------------------------------------------------------------------------------------------ recuperacao
test('recuperacao: 0,8 por hora de descanso inteira, soneca ate 5, teto 8 e 35% do desgaste', () => {
  near(recoveryPoints({ restHours: 3, napMinutes: 0 }, 100), 2.4, 1e-9);
  near(recoveryPoints({ restHours: 3.9, napMinutes: 0 }, 100), 2.4, 1e-9); // so horas inteiras
  assert.equal(recoveryPoints({ restHours: 0, napMinutes: 30 }, 100), 2.5);
  assert.equal(recoveryPoints({ restHours: 0, napMinutes: 600 }, 100), 5); // teto da soneca
  assert.equal(recoveryPoints({ restHours: 20, napMinutes: 600 }, 100), 8); // teto total
  near(recoveryPoints({ restHours: 20, napMinutes: 0 }, 10), 3.5, 1e-9); // 35% do desgaste
  assert.equal(recoveryPoints({ restHours: 5, napMinutes: 60 }, 0), 0); // nada gasto, nada a recuperar
});

test('recuperacao: entradas invalidas ou negativas valem 0', () => {
  assert.equal(recoveryPoints({ restHours: -4, napMinutes: -30 }, 50), 0);
  assert.equal(recoveryPoints({ restHours: NaN, napMinutes: NaN }, 50), 0);
  assert.equal(recoveryPoints({}, 50), 0);
  assert.equal(recoveryPoints({ restHours: 5, napMinutes: 5 }, -10), 0);
});

// ------------------------------------------------------------------------------------------------------------------------------- resultado
test('resultado: sem desgaste = base; fator menor para base baixa', () => {
  assert.equal(applyWear(88, 0, 0), 88);
  assert.equal(applyWear(100, 20, 0), 80);
  near(applyWear(50, 20, 0), 34, 1e-9); // fator 0,8
  assert.equal(applyWear(70, 10, 10), 70); // recuperacao igual ao desgaste: volta a base
  assert.equal(applyWear(70, 10, 30), 70); // nunca passa da base
});

test('resultado: queda maxima de 55 pontos, piso 0, base limitada a 0-100', () => {
  assert.equal(applyWear(100, 55, 0), 45);
  assert.ok(applyWear(100, 500, 0) >= 45);
  assert.equal(applyWear(30, 500, 0), 0); // 30 - 55 < 0
  assert.equal(applyWear(150, 0, 0), 100);
  assert.equal(applyWear(-10, 0, 0), 0);
  assert.equal(applyWear(100, -20, 0), 100); // desgaste negativo nao sobe
});

test('estado: limiares 65 / 40 nas bordas; ausente e NaN = sem dados', () => {
  assert.equal(dynamicScoreToState(100), 'fit');
  assert.equal(dynamicScoreToState(65), 'fit');
  assert.equal(dynamicScoreToState(64.9), 'attention');
  assert.equal(dynamicScoreToState(40), 'attention');
  assert.equal(dynamicScoreToState(39.9), 'recover');
  assert.equal(dynamicScoreToState(0), 'recover');
  assert.equal(dynamicScoreToState(150), 'fit');
  assert.equal(dynamicScoreToState(-5), 'recover');
  for (const bad of [null, undefined, NaN]) assert.equal(dynamicScoreToState(bad), 'nodata');
});

// ------------------------------------------------------------------------------------------------------------------------------ estabilidade
test('suavizacao: sem anterior mostra o novo; variacao < 1 ponto nao mexe; queda ate 12 e subida ate 2', () => {
  assert.equal(smoothVitality(null, 71.4), 71);
  assert.equal(smoothVitality(undefined, 71.6), 72);
  assert.equal(smoothVitality(80, 80.9), 80); // histerese
  assert.equal(smoothVitality(80, 79.1), 80);
  assert.equal(smoothVitality(80, 60), 68); // queda limitada a 12
  assert.equal(smoothVitality(80, 75), 75); // queda menor que o limite passa inteira
  assert.equal(smoothVitality(80, 95), 82); // subida limitada a 2
  assert.equal(smoothVitality(80, 81), 81);
  assert.equal(smoothVitality(5, -20), 0);
  assert.equal(smoothVitality(99, 140), 100);
  assert.equal(smoothVitality(NaN, 55), 55);
});

test('suavizacao: idempotente e nunca sai de 0-100', () => {
  for (const v of [0, 1, 33, 64, 100]) assert.equal(smoothVitality(v, v), v);
  const r = rng(7);
  for (let i = 0; i < 500; i += 1) {
    const out = smoothVitality(r() * 100, r() * 140 - 20);
    assert.ok(Number.isInteger(out) && out >= 0 && out <= 100);
  }
});

test('sequencia de leituras com tremor: nunca sobe mais de 2 nem cai mais de 12 por atualizacao', () => {
  const r = rng(42);
  let shown = null;
  let raw = 88;
  for (let i = 0; i < 400; i += 1) {
    raw = Math.max(0, Math.min(100, raw + (r() - 0.62) * 9)); // tendencia de queda com ruido
    const next = smoothVitality(shown, raw);
    if (shown != null) {
      assert.ok(next - shown <= 2, `subiu ${next - shown}`);
      assert.ok(shown - next <= 12, `caiu ${shown - next}`);
    }
    shown = next;
  }
});

test('leitura que falha ou atrasa nao recupera a Vitalidade: totais do dia so crescem', () => {
  const prev = day({ steps: 7000, activeKcal: 400, restHours: 3, napMinutes: 20, workouts: [{ minutes: 40 }] });
  const lagging = day({ steps: 5000, activeKcal: 250, restHours: 1, napMinutes: 0, workouts: [] });
  const merged = monotonicDay(prev, lagging);
  assert.equal(merged.steps, 7000);
  assert.equal(merged.activeKcal, 400);
  assert.equal(merged.restHours, 3);
  assert.equal(merged.napMinutes, 20);
  assert.equal(merged.workouts.length, 1);
  const grown = monotonicDay(prev, day({ steps: 9000, activeKcal: 500, restHours: 4, napMinutes: 20, workouts: [{ minutes: 40 }, { minutes: 20 }] }));
  assert.equal(grown.steps, 9000);
  assert.equal(grown.workouts.length, 2);
  assert.equal(monotonicDay(null, lagging), lagging);
  assert.equal(monotonicDay(prev, day({ steps: null, activeKcal: null })).steps, 7000); // leitura vazia nao apaga o que ja se sabe
  assert.equal(monotonicDay(day({ steps: null, activeKcal: null }), day({ steps: 100, activeKcal: 5 })).steps, 100);
  assert.equal(monotonicDay(day({ steps: null, activeKcal: null }), day({ steps: null, activeKcal: null })).steps, null);
});

test('com a leitura monotonica e a suavizacao, um dia inteiro com leituras que oscilam so desce (e sobe no maximo 2)', () => {
  const base = 88;
  const r = rng(11);
  let prevDay = null;
  let shown = null;
  let steps = 0;
  const history = [];
  for (let step = 0; step < 120; step += 1) {
    steps += r() * 150;
    const lag = r() < 0.3 ? 0.9 : 1; // 30% das leituras atrasadas
    const reading = day({ steps: steps * lag, activeKcal: steps * 0.045 * lag });
    prevDay = monotonicDay(prevDay, reading);
    const raw = vitalityNow(base, prevDay, REFS, 60).score;
    const next = smoothVitality(shown, raw);
    history.push(next);
    shown = next;
  }
  for (let i = 1; i < history.length; i += 1) assert.ok(history[i] <= history[i - 1], `subiu na posicao ${i}`);
  assert.ok(history[history.length - 1] < history[0]);
});

// ------------------------------------------------------------------------------------------------------------------------------ base do dia
test('base congelada: a de hoje vale o dia todo; a de outro dia e ignorada', () => {
  const stored = { dayKey: '2026-11-17', base: 82 };
  assert.deepEqual(freezeMorningBase(stored, '2026-11-17', { base: 60, final: true }), { base: 82, provisional: false, persist: null });
  const next = freezeMorningBase({ dayKey: '2026-11-16', base: 82 }, '2026-11-17', { base: 71, final: true });
  assert.deepEqual(next, { base: 71, provisional: false, persist: { dayKey: '2026-11-17', base: 71 } });
});

test('base provisoria (sono de ontem) nunca e congelada; sem candidata = null', () => {
  assert.deepEqual(freezeMorningBase(null, '2026-11-17', { base: 75, final: false }), { base: 75, provisional: true, persist: null });
  assert.deepEqual(freezeMorningBase(null, '2026-11-17', { base: null, final: true }), { base: null, provisional: false, persist: null });
  assert.deepEqual(freezeMorningBase(undefined, '2026-11-17', { base: NaN, final: true }), { base: null, provisional: false, persist: null });
});

// ------------------------------------------------------------------------------------------------------------------------------ o que mostrar
const baseInput = (over = {}) => ({
  base: 88, provisional: false, day: day({ steps: 6000, activeKcal: 300 }), refs: REFS, restHr: 60, maxHr: 190,
  previousShown: null, previousShownIsToday: false, yesterdayFinal: null, ...over,
});

test('exibicao: sem base e sem valor de ontem = sem dados (nunca um numero inventado)', () => {
  const r = displayedVitality(baseInput({ base: null }));
  assert.deepEqual({ score: r.score, state: r.state, provisional: r.provisional }, { score: null, state: 'nodata', provisional: false });
});

test('exibicao: sem base mas com o valor de ontem mostra o de ontem como provisorio', () => {
  const r = displayedVitality(baseInput({ base: null, yesterdayFinal: 54.4 }));
  assert.deepEqual({ score: r.score, state: r.state, provisional: r.provisional }, { score: 54, state: 'attention', provisional: true });
});

test('exibicao: antes de acordar (base provisoria) mantem o valor de ontem; sem ele usa a base provisoria', () => {
  assert.equal(displayedVitality(baseInput({ provisional: true, yesterdayFinal: 47 })).score, 47);
  assert.equal(displayedVitality(baseInput({ provisional: true, yesterdayFinal: null, base: 76.4 })).score, 76);
  assert.equal(displayedVitality(baseInput({ provisional: true, yesterdayFinal: 47 })).provisional, true);
  assert.equal(displayedVitality(baseInput({ provisional: true, yesterdayFinal: 47 })).result, null);
});

test('exibicao: com sono de hoje calcula, o primeiro valor do dia NAO e suavizado contra o de ontem', () => {
  const r = displayedVitality(baseInput({ previousShown: 40, previousShownIsToday: false }));
  assert.equal(r.provisional, false);
  assert.equal(r.score, Math.round(vitalityNow(88, day({ steps: 6000, activeKcal: 300 }), REFS, 60).score));
});

test('exibicao: dentro do mesmo dia aplica a suavizacao (cai ate 12, sobe ate 2)', () => {
  const heavy = day({ steps: 20000, activeKcal: 1200 });
  const down = displayedVitality(baseInput({ day: heavy, previousShown: 85, previousShownIsToday: true }));
  assert.equal(down.score, 73);
  const up = displayedVitality(baseInput({ day: day(), previousShown: 60, previousShownIsToday: true }));
  assert.equal(up.score, 62);
});

test('exibicao: base boa sem nenhuma leitura de hoje ainda = a propria base', () => {
  const r = displayedVitality(baseInput({ day: null }));
  assert.equal(r.score, 88);
  assert.equal(r.state, 'fit');
});

// ------------------------------------------------------------------------------------------------------------------------------ propriedades
test('propriedades (2000 casos aleatorios): limites, teto de queda, V <= base e monotonia em cada entrada', () => {
  const r = rng(2026);
  for (let i = 0; i < 2000; i += 1) {
    const base = r() * 100;
    const d = day({
      steps: r() < 0.1 ? null : r() * 40000,
      activeKcal: r() < 0.1 ? null : r() * 3000,
      awakeHrElevation: r() < 0.2 ? null : r() * 50,
      restHours: Math.floor(r() * 16),
      napMinutes: r() * 120,
      workouts: Array.from({ length: Math.floor(r() * 3) }, () => ({ minutes: r() * 150, avgHr: r() < 0.3 ? null : 90 + r() * 100, steps: r() < 0.5 ? null : r() * 8000, activeKcal: r() < 0.5 ? null : r() * 900 })),
    });
    const refs = personalReferences([], 40 + r() * 40);
    const out = vitalityNow(base, d, refs, 40 + r() * 40, 150 + r() * 60);
    assert.ok(out.score >= 0 && out.score <= 100, `fora de 0-100: ${out.score}`);
    assert.ok(out.score <= base + 1e-9, 'passou da base');
    assert.ok(out.score >= Math.max(0, base - 55) - 1e-9, 'caiu mais de 55');
    assert.ok(out.wear.total <= 55 + 1e-9);
    assert.ok(out.recovery <= Math.min(8, 0.35 * out.wear.total) + 1e-9);

    // mais passos (sem mexer no resto) nunca aumenta a Vitalidade
    const more = vitalityNow(base, { ...d, steps: (d.steps ?? 0) + 1000 + r() * 5000 }, refs, 60, 190);
    const less = vitalityNow(base, d, refs, 60, 190);
    assert.ok(more.wear.total >= less.wear.total - 1e-9 || d.steps == null, 'desgaste caiu com mais passos');
    // um treino a mais, com os seus proprios passos e calorias SOMADOS aos totais do dia, nunca reduz o desgaste
    // (sem somar, o treino so "toma" passos/calorias do movimento, e o desgaste liquido pode cair: nao e o caso real)
    const extra = { minutes: 20 + r() * 60, steps: r() * 4000, activeKcal: r() * 500 };
    const withMore = dayWear({ ...d, steps: d.steps == null ? null : d.steps + extra.steps, activeKcal: d.activeKcal == null ? null : d.activeKcal + extra.activeKcal, workouts: [...d.workouts, extra] }, refs, 60, 190);
    assert.ok(withMore.total >= dayWear(d, refs, 60, 190).total - 1e-9, 'um treino a mais (somado aos totais) diminuiu o desgaste');
  }
});

test('dia tipico: base 88, passos e calorias na referencia, sem treino, da 77 a 78 sem recuperar nada', () => {
  const out = vitalityNow(88, day({ steps: 6000, activeKcal: 300 }), REFS, 60);
  near(out.wear.movement, 10.55, 0.01);
  near(out.score, 88 - 10.55 * (0.6 + 0.4 * 0.88), 0.01);
  assert.ok(out.score > 77 && out.score < 79);
});

// ------------------------------------------------------------------------------------------------------------ desgaste por TEMPO acordado
import { TIME_WEAR, awakeMinutesSince, timeWear } from '../services/vitalityDynamic.ts';

test('constantes do desgaste por tempo: 2,5 pontos/hora, teto 40, cochilo 1 + 0,5', () => {
  assert.deepEqual({ ...TIME_WEAR }, { ratePerHour: 2.5, cap: 40, napSleepNotAwake: 1, napRestorativeCredit: 0.5 });
});

test('desgaste por tempo: 2,5 por hora, teto 40; ausente, zero ou negativo = 0 (sem ancora nao se inventa)', () => {
  assert.equal(timeWear(60), 2.5);
  assert.equal(timeWear(12 * 60), 30);
  assert.equal(timeWear(16 * 60), 40);
  assert.equal(timeWear(40 * 60), 40);
  assert.equal(timeWear(30), 1.25);
  for (const none of [0, -5, NaN, null, undefined]) assert.equal(timeWear(none), 0);
});

test('minutos acordado desde a ancora: atravessa a meia-noite e o cochilo abate 1,5 minuto por minuto dormido', () => {
  const anchor = new Date(2026, 10, 17, 12, 0).getTime();
  const midnightPlus = new Date(2026, 10, 18, 0, 30).getTime();
  assert.equal(awakeMinutesSince(anchor, midnightPlus, 0), 12 * 60 + 30); // a meia-noite nao reinicia
  assert.equal(awakeMinutesSince(anchor, midnightPlus, 30), 12 * 60 + 30 - 45);
  assert.equal(awakeMinutesSince(anchor, anchor, 0), 0);
  assert.equal(awakeMinutesSince(anchor, anchor - 1000, 0), 0); // ancora no futuro
  assert.equal(awakeMinutesSince(anchor, anchor + 20 * 60000, 600), 0); // cochilo maior que o tempo: nunca negativo
  assert.equal(awakeMinutesSince(null, midnightPlus, 0), 0);
  assert.equal(awakeMinutesSince(undefined, midnightPlus, 0), 0);
  assert.equal(awakeMinutesSince(anchor, NaN, 0), 0);
  assert.equal(awakeMinutesSince(anchor, midnightPlus, null), 12 * 60 + 30);
  assert.equal(awakeMinutesSince(anchor, midnightPlus, -10), 12 * 60 + 30);
});

test('o desgaste total soma o tempo (parcela propria) e continua limitado a 55', () => {
  const refs = { steps: 6000, kcal: 300, eref: 60, fromHistory: { steps: true, kcal: true, eref: true } };
  const sitting = dayWear({ steps: 0, activeKcal: 0, workouts: [], awakeMinutes: 12 * 60 }, refs, 60, 190);
  assert.equal(sitting.time, 30);
  assert.equal(sitting.total, 30);
  const noAnchor = dayWear({ steps: 0, activeKcal: 0, workouts: [], awakeMinutes: null }, refs, 60, 190);
  assert.equal(noAnchor.time, 0);
  const huge = dayWear({ steps: 90000, activeKcal: 9000, awakeHrElevation: 80, workouts: [{ minutes: 600, avgHr: 190 }], awakeMinutes: 20 * 60 }, refs, 60, 190);
  assert.equal(huge.total, 55);
  assert.equal(huge.time, 40);
});

test('recuperar por descanso so abate o desgaste FISICO: sentar 12 h nao devolve as horas acordado', () => {
  const refs = { steps: 6000, kcal: 300, eref: 60, fromHistory: { steps: true, kcal: true, eref: true } };
  const out = vitalityNow(90, { steps: 1000, activeKcal: 50, workouts: [], restHours: 12, awakeMinutes: 12 * 60 }, refs, 60);
  assert.ok(out.recovery <= 0.35 * (out.wear.movement + out.wear.training + out.wear.heartRate) + 1e-9);
  assert.ok(out.recovery < 2);
  assert.ok(out.score < 90 - 25); // o tempo pesou quase inteiro
});

test('com o tempo acordado a Vitalidade continua entre 0 e 100, nunca passa da base e nunca cai mais que 55', () => {
  const refs = { steps: 6000, kcal: 300, eref: 60, fromHistory: { steps: true, kcal: true, eref: true } };
  const r = rng(99);
  for (let i = 0; i < 1500; i += 1) {
    const base = r() * 100;
    const out = vitalityNow(base, {
      steps: r() < 0.1 ? null : r() * 40000, activeKcal: r() * 3000, workouts: [{ minutes: r() * 150, avgHr: 90 + r() * 100 }],
      awakeMinutes: r() < 0.1 ? null : r() * 60 * 60, restHours: Math.floor(r() * 20), napMinutes: r() * 120, awakeHrElevation: r() * 50,
    }, refs, 60);
    assert.ok(out.score >= 0 && out.score <= 100);
    assert.ok(out.score <= base + 1e-9);
    assert.ok(out.score >= Math.max(0, base - 55) - 1e-9);
    assert.ok(out.wear.total <= 55 + 1e-9);
  }
});
