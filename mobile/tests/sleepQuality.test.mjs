// Testes da qualidade do sono (services/sleepQuality.ts). Rodar: `npm test` (Node >= 22.18, sem dependencias).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SLEEP_HISTORY_MIN_NIGHTS,
  SLEEP_NEED_HOURS_DEFAULT,
  SLEEP_QUALITY_WEIGHTS,
  awakeningsScore,
  circularStdMinutes,
  computeSleepQuality,
  debtScore,
  durationScore,
  efficiencyScore,
  regularityScore,
  sleepDebtHours,
  stagesScore,
} from '../services/sleepQuality.ts';

const near = (actual, expected, eps = 0.05, msg) => assert.ok(Math.abs(actual - expected) <= eps, `${msg ?? ''} esperado ~${expected}, veio ${actual}`);

/** Noite "perfeita" de 8 h com todos os dados. */
const perfect = (over = {}) => ({ asleepMin: 480, inBedMin: 500, awakeAfterOnsetMin: 0, deepMin: 480 * 0.15, remMin: 480 * 0.2, midpointMin: 180, ...over });
const week = (n = 7, over = {}) => Array.from({ length: n }, () => perfect(over));

test('pesos somam 1 e a necessidade padrao e 8 h', () => {
  near(Object.values(SLEEP_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0), 1, 1e-9);
  assert.equal(SLEEP_NEED_HOURS_DEFAULT, 8);
  assert.equal(SLEEP_HISTORY_MIN_NIGHTS, 4);
});

// ------------------------------------------------------------------------------------------------ duracao
test('duracao: bordas r = 1, 0.5, 1.25 e acima', () => {
  assert.equal(durationScore(480), 100);
  near(durationScore(7 * 60), 80.8, 0.1);
  near(durationScore(240), 33.0, 0.1); // r = 0,5
  assert.equal(durationScore(0), 0);
  assert.equal(durationScore(-30), 0);
  assert.equal(durationScore(600), 100); // r = 1,25
  near(durationScore(630), 95, 0.01); // r = 1,3125
  assert.equal(durationScore(14 * 60), 70); // piso do excesso
  assert.equal(durationScore(20 * 60), 70);
});

test('duracao: necessidade personalizada e necessidade invalida volta a 8 h', () => {
  assert.equal(durationScore(420, 7), 100);
  assert.equal(durationScore(480, 0), durationScore(480, 8));
  assert.equal(durationScore(400, NaN), durationScore(400, 8));
  assert.equal(durationScore(400, -3), durationScore(400, 8));
});

test('duracao: nunca diminui quando se dorme mais ate a necessidade', () => {
  let prev = -1;
  for (let m = 0; m <= 480; m += 15) {
    const s = durationScore(m);
    assert.ok(s >= prev, `${m} min`);
    prev = s;
  }
});

// ------------------------------------------------------------------------------------------------ eficiencia, despertares
test('eficiencia: 92% ou mais = 100, 75% ou menos = 0, linear no meio, acima de 100% limitada', () => {
  assert.equal(efficiencyScore(460, 500), 100); // 92%
  assert.equal(efficiencyScore(500, 500), 100);
  near(efficiencyScore(450, 500), 100 * ((0.9 - 0.75) / 0.17), 1e-9); // 90%
  assert.equal(efficiencyScore(375, 500), 0); // 75%
  assert.equal(efficiencyScore(300, 500), 0);
  near(efficiencyScore(417.5, 500), 50, 0.1); // 83,5%
  assert.equal(efficiencyScore(520, 500), 100); // dormiu "mais que ficou na cama": dado inconsistente, limitado
});

test('despertares: 0 min = 100, 30 min = 64, 84 min ou mais = 0, negativo tratado como 0', () => {
  assert.equal(awakeningsScore(0), 100);
  near(awakeningsScore(30), 64, 1e-9);
  assert.equal(awakeningsScore(84), 0);
  assert.equal(awakeningsScore(300), 0);
  assert.equal(awakeningsScore(-10), 100);
});

// ------------------------------------------------------------------------------------------------ divida e regularidade
test('divida: so conta noites abaixo da necessidade e a nota cai 12,5 por hora', () => {
  assert.equal(sleepDebtHours([480, 480, 480]), 0);
  assert.equal(sleepDebtHours([600, 360]), 2); // o excesso de uma noite nao paga a divida de outra
  assert.equal(sleepDebtHours([360, 360]), 4);
  assert.equal(debtScore(0), 100);
  assert.equal(debtScore(2), 75);
  assert.equal(debtScore(8), 0);
  assert.equal(debtScore(20), 0);
  assert.equal(debtScore(-1), 100);
});

test('regularidade circular: 23:50 e 00:10 estao a 20 min, nao a quase 24 h', () => {
  near(circularStdMinutes([1430, 10]), 10, 0.5);
  near(circularStdMinutes([1430, 5, 1435, 10]), 8.5, 1.5);
  assert.equal(circularStdMinutes([180]), 0);
  assert.equal(circularStdMinutes([]), 0);
  assert.equal(circularStdMinutes([200, 200, 200]), 0);
  assert.equal(circularStdMinutes([0, 720]), 720); // espalhado pelo relogio inteiro = maximo
  const spread = circularStdMinutes([120, 180, 240, 300]);
  assert.ok(spread > 40 && spread < 120, String(spread));
});

test('regularidade: ate 20 min = 100, 60 min = 68, 145 min ou mais = 0', () => {
  assert.equal(regularityScore(0), 100);
  assert.equal(regularityScore(20), 100);
  near(regularityScore(60), 68, 1e-9);
  assert.equal(regularityScore(145), 0);
  assert.equal(regularityScore(700), 0);
});

// ------------------------------------------------------------------------------------------------ estagios
test('estagios: profundo 15% e REM 20% valem 100; proporcional abaixo; media dos dois', () => {
  assert.equal(stagesScore(72, 96, 480), 100);
  assert.equal(stagesScore(200, 300, 480), 100); // acima do alvo nao passa de 100
  assert.equal(stagesScore(0, 0, 480), 0);
  near(stagesScore(36, 96, 480), 75, 1e-9); // profundo na metade (50) + REM cheio (100)
  near(stagesScore(72, 48, 480), 75, 1e-9);
});

// ------------------------------------------------------------------------------------------------ composicao
test('sem noite ou sem duracao: quality null e confianca 0 (nunca zero)', () => {
  for (const nights of [[], null, undefined, [null], [{ asleepMin: null }], [{ asleepMin: 0 }], [{ asleepMin: NaN }], [{ asleepMin: -5 }], [{}], week(6).concat([{ asleepMin: 0 }])]) {
    const r = computeSleepQuality(nights);
    assert.equal(r.quality, null, JSON.stringify(nights)?.slice(0, 60));
    assert.equal(r.confidence, 0);
    assert.deepEqual(r.parts, {});
  }
});

test('so a duracao: qualidade = nota da duracao e confianca 0,35', () => {
  const r = computeSleepQuality([{ asleepMin: 480 }]);
  assert.equal(r.quality, 100);
  assert.equal(r.confidence, 0.35);
  assert.deepEqual(Object.keys(r.parts), ['duration']);
  assert.equal(computeSleepQuality([{ asleepMin: 240 }]).quality, 33);
});

test('todos os componentes e noite perfeita: 100 com confianca 1', () => {
  const r = computeSleepQuality(week());
  assert.equal(r.quality, 100);
  assert.equal(r.confidence, 1);
  assert.deepEqual(Object.keys(r.parts).sort(), ['awakenings', 'debt', 'duration', 'efficiency', 'regularity', 'stages']);
});

test('renormaliza os pesos quando falta componente', () => {
  // duracao 4 h (33) + eficiencia perfeita (100): (0,35*32,99 + 0,12*100) / 0,47
  const r = computeSleepQuality([{ asleepMin: 240, inBedMin: 250 }]);
  assert.equal(r.quality, 50);
  assert.equal(r.confidence, 0.47);
  // sem estagios: sobra 0,80 de peso; noite perfeita continua 100
  assert.equal(computeSleepQuality(week(7, { deepMin: null, remMin: null })).quality, 100);
  assert.equal(computeSleepQuality(week(7, { deepMin: null, remMin: null })).confidence, 0.8);
});

test('divida e regularidade exigem pelo menos 4 noites; abaixo disso ficam ausentes (nao viram "ruim")', () => {
  const three = computeSleepQuality(week(3));
  assert.ok(!('debt' in three.parts) && !('regularity' in three.parts));
  const four = computeSleepQuality(week(4));
  assert.ok('debt' in four.parts && 'regularity' in four.parts);
  assert.equal(four.confidence, 1);
});

test('so as 7 noites mais recentes entram na divida (noites antigas ruins ficam de fora)', () => {
  const old = Array.from({ length: 5 }, () => perfect({ asleepMin: 120, midpointMin: 700 }));
  const r = computeSleepQuality([...old, ...week(7)]);
  assert.equal(r.parts.debt, 100);
  assert.equal(r.parts.regularity, 100);
});

test('divida alta derruba a nota mesmo com a ultima noite boa', () => {
  const bad = Array.from({ length: 6 }, () => perfect({ asleepMin: 300 })); // 6 x 3 h de divida
  const r = computeSleepQuality([...bad, perfect()]);
  assert.equal(r.parts.debt, 100 - 18 * 12.5 < 0 ? 0 : 100 - 18 * 12.5);
  assert.ok(r.quality < computeSleepQuality(week()).quality);
});

test('regularidade atravessando a meia-noite nao e penalizada a toa', () => {
  const nights = [1430, 5, 1435, 10, 1432, 8, 1438].map((m) => perfect({ midpointMin: m }));
  const r = computeSleepQuality(nights);
  assert.ok(r.parts.regularity >= 95, String(r.parts.regularity));
  const irregular = [60, 400, 900, 1200, 200, 700, 1000].map((m) => perfect({ midpointMin: m }));
  assert.ok(computeSleepQuality(irregular).parts.regularity < 20);
});

test('dado invalido retira SO o componente afetado, o resto continua', () => {
  const base = computeSleepQuality(week());
  const bad = computeSleepQuality(week(7, { inBedMin: NaN, awakeAfterOnsetMin: -5, midpointMin: 5000 }).map((n, i, a) => (i === a.length - 1 ? n : perfect())));
  assert.ok(!('efficiency' in bad.parts));
  assert.ok(!('awakenings' in bad.parts));
  assert.ok('duration' in bad.parts && 'stages' in bad.parts && 'debt' in bad.parts);
  assert.equal(bad.quality, base.quality); // renormalizado, a noite continua perfeita nos componentes que sobraram
});

test('estagios inconsistentes (profundo + REM maiores que o sono) ou so um dos dois: componente ausente', () => {
  assert.ok(!('stages' in computeSleepQuality([perfect({ deepMin: 400, remMin: 400 })]).parts));
  assert.ok(!('stages' in computeSleepQuality([perfect({ deepMin: 70, remMin: null })]).parts));
  assert.ok(!('stages' in computeSleepQuality([perfect({ deepMin: null, remMin: 90 })]).parts));
  assert.ok('stages' in computeSleepQuality([perfect({ deepMin: 0, remMin: 0 })]).parts); // zero MEDIDO e um valor valido
  assert.equal(computeSleepQuality([perfect({ deepMin: 0, remMin: 0 })]).parts.stages, 0);
});

test('zero minutos acordado e valido (100) e e diferente de nao saber (ausente)', () => {
  assert.equal(computeSleepQuality([perfect({ awakeAfterOnsetMin: 0 })]).parts.awakenings, 100);
  assert.ok(!('awakenings' in computeSleepQuality([perfect({ awakeAfterOnsetMin: null })]).parts));
  assert.ok(!('awakenings' in computeSleepQuality([perfect({ awakeAfterOnsetMin: undefined })]).parts));
});

test('noite pessima e noite excelente ficam em extremos coerentes e dentro de 0-100', () => {
  const awful = computeSleepQuality([...Array.from({ length: 6 }, () => perfect({ asleepMin: 240, midpointMin: 100 })), { asleepMin: 150, inBedMin: 400, awakeAfterOnsetMin: 120, deepMin: 5, remMin: 5, midpointMin: 900 }]);
  assert.ok(awful.quality >= 0 && awful.quality <= 15, String(awful.quality));
  const great = computeSleepQuality(week());
  assert.equal(great.quality, 100);
  assert.ok(Number.isInteger(awful.quality));
});

test('necessidade personalizada propaga para duracao e divida', () => {
  const nights = week(7, { asleepMin: 420 });
  assert.equal(computeSleepQuality(nights, 7).parts.duration, 100);
  assert.equal(computeSleepQuality(nights, 7).parts.debt, 100);
  assert.ok(computeSleepQuality(nights, 8).parts.debt < 100);
  assert.equal(computeSleepQuality(nights, 0).parts.duration, computeSleepQuality(nights, 8).parts.duration);
});

test('deterministico e sem efeito colateral nos dados de entrada', () => {
  const nights = week();
  const snapshot = JSON.stringify(nights);
  const a = computeSleepQuality(nights);
  const b = computeSleepQuality(nights);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(nights), snapshot);
});
