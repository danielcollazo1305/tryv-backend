// Testes da montagem das noites a partir das amostras do HealthKit (services/sleepNights.ts). Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSleepNightsForQuality, sleepQualityForToday } from '../services/sleepNights.ts';

// "Agora" fixo: terca 17/11/2026 10:00 (horario LOCAL, como o app). dayOffset negativo = dias antes de hoje.
const NOW = new Date(2026, 10, 17, 10, 0, 0);
const at = (dayOffset, hour, minute = 0) => new Date(2026, 10, 17 + dayOffset, hour, minute, 0);
const sample = (start, end, value, sourceId = 'watch') => ({ startDate: start, endDate: end, value, sourceId, sourceName: sourceId });
const keyOf = (dayOffset) => `2026-11-${String(17 + dayOffset).padStart(2, '0')}`;

// Noite completa com estagios (Apple Watch): 23:00 -> 07:00 (480 min), 8 h na cama.
//   core 23:00-00:30 (90), deep 00:30-01:30 (60), core 01:30-03:00 (90), awake 03:00-03:10 (10), rem 03:10-04:10 (60), core 04:10-06:00 (110), rem 06:00-07:00 (60)
//   dormido = 90+60+90+60+110+60 = 470; acordado depois de dormir = 10
function wakeNight(wakeOffset, { source = 'watch', withInBed = true } = {}) {
  const d = wakeOffset - 1; // o dia em que deitou
  const list = [
    sample(at(d, 23, 0), at(wakeOffset, 0, 30), 3, source),
    sample(at(wakeOffset, 0, 30), at(wakeOffset, 1, 30), 4, source),
    sample(at(wakeOffset, 1, 30), at(wakeOffset, 3, 0), 3, source),
    sample(at(wakeOffset, 3, 0), at(wakeOffset, 3, 10), 2, source),
    sample(at(wakeOffset, 3, 10), at(wakeOffset, 4, 10), 5, source),
    sample(at(wakeOffset, 4, 10), at(wakeOffset, 6, 0), 3, source),
    sample(at(wakeOffset, 6, 0), at(wakeOffset, 7, 0), 5, source),
  ];
  if (withInBed) list.push(sample(at(d, 22, 50), at(wakeOffset, 7, 10), 0, 'iphone')); // na cama 22:50-07:10 = 500 min
  return list;
}

test('uma noite com estagios: minutos dormidos, na cama, despertares, profundo, REM e ponto medio', () => {
  const nights = buildSleepNightsForQuality(wakeNight(0));
  assert.equal(nights.length, 1);
  const n = nights[0];
  assert.equal(n.wakeDate, keyOf(0));
  assert.equal(n.asleepMin, 470);
  assert.equal(n.inBedMin, 500);
  assert.equal(n.awakeAfterOnsetMin, 10);
  assert.equal(n.deepMin, 60);
  assert.equal(n.remMin, 120);
  assert.equal(n.midpointMin, 3 * 60); // meio entre 23:00 e 07:00 = 03:00
});

test('sem estagios (so "dormindo"): despertares, profundo e REM ficam null, nunca zero', () => {
  const nights = buildSleepNightsForQuality([sample(at(-1, 23, 0), at(0, 6, 30), 1, 'app-x')]);
  assert.equal(nights[0].asleepMin, 450);
  assert.equal(nights[0].awakeAfterOnsetMin, null);
  assert.equal(nights[0].deepMin, null);
  assert.equal(nights[0].remMin, null);
  assert.equal(nights[0].inBedMin, null); // tambem sem "na cama"
});

test('sem amostras de "na cama": eficiencia ausente (inBedMin null)', () => {
  assert.equal(buildSleepNightsForQuality(wakeNight(0, { withInBed: false }))[0].inBedMin, null);
});

test('soneca (comeca entre 9h e 20h) fica de fora; so a soneca = nenhuma noite', () => {
  assert.deepEqual(buildSleepNightsForQuality([sample(at(0, 14, 0), at(0, 14, 40), 1)]), []);
  const withNap = buildSleepNightsForQuality([...wakeNight(-1), sample(at(-1, 14, 0), at(-1, 14, 30), 1)]);
  assert.equal(withNap.length, 1);
  assert.equal(withNap[0].asleepMin, 470); // a soneca nao somou
});

test('bordas da soneca: 08:59 e 20:00 sao noite; 09:00 e 19:59 sao soneca', () => {
  const len = (h, m) => {
    const start = at(0, h, m);
    return buildSleepNightsForQuality([sample(start, new Date(start.getTime() + 30 * 60000), 1)]).length;
  };
  assert.equal(len(8, 59), 1); // 08:59 e noite
  assert.equal(len(9, 0), 0);
  assert.equal(len(19, 59), 0);
  assert.equal(len(20, 0), 1);
});

test('noite quebrada por pausa maior que 90 min (acorda e volta a dormir) continua sendo UMA noite e soma as partes', () => {
  const split = [
    sample(at(-1, 23, 0), at(0, 3, 0), 1), // 240 min
    sample(at(0, 5, 0), at(0, 7, 0), 1), // pausa de 120 min -> outra sessao, mesmo dia de despertar; 120 min
  ];
  const nights = buildSleepNightsForQuality(split);
  assert.equal(nights.length, 1);
  assert.equal(nights[0].asleepMin, 360);
  assert.equal(nights[0].midpointMin, 3 * 60); // meio entre 23:00 e 07:00
});

test('uma pausa de ate 90 min nao parte a noite (mesma sessao)', () => {
  const nights = buildSleepNightsForQuality([sample(at(-1, 23, 0), at(0, 3, 0), 1), sample(at(0, 4, 20), at(0, 7, 0), 1)]); // pausa de 80 min
  assert.equal(nights.length, 1);
  assert.equal(nights[0].asleepMin, 240 + 160);
});

test('duas fontes gravando o mesmo sono nao contam duas vezes (uniao dos intervalos)', () => {
  const nights = buildSleepNightsForQuality([...wakeNight(0, { source: 'watch' }), sample(at(-1, 23, 0), at(0, 7, 0), 1, 'phone-app')]);
  assert.equal(nights[0].asleepMin, 480); // 23:00-07:00 por uniao, nao 470 + 480
  assert.ok(nights[0].deepMin === 60 && nights[0].remMin === 120); // estagios continuam so da fonte que os tem
});

test('noite que atravessa a meia-noite entra no dia do DESPERTAR', () => {
  const nights = buildSleepNightsForQuality(wakeNight(-2));
  assert.equal(nights[0].wakeDate, keyOf(-2));
});

test('varias noites vem ordenadas da mais antiga para a mais nova e limitadas a `count`', () => {
  const samples = [wakeNight(-3), wakeNight(0), wakeNight(-1), wakeNight(-2)].flat();
  const all = buildSleepNightsForQuality(samples);
  assert.deepEqual(all.map((n) => n.wakeDate), [keyOf(-3), keyOf(-2), keyOf(-1), keyOf(0)]);
  assert.deepEqual(buildSleepNightsForQuality(samples, 2).map((n) => n.wakeDate), [keyOf(-1), keyOf(0)]);
});

test('amostras invalidas, vazias ou nulas nao quebram', () => {
  assert.deepEqual(buildSleepNightsForQuality([]), []);
  assert.deepEqual(buildSleepNightsForQuality(null), []);
  assert.deepEqual(buildSleepNightsForQuality([{ startDate: 'x', endDate: null, value: 1 }, sample(at(0, 6, 0), at(0, 5, 0), 1)]), []);
  assert.deepEqual(buildSleepNightsForQuality([sample(at(-1, 23, 0), at(0, 7, 0), 0)]), []); // so "na cama" nao e sono
});

// ------------------------------------------------------------------------------------------------ qualidade de hoje
test('qualidade de hoje: noite que terminou hoje, isToday true; com 7 noites boas entra todo o historico', () => {
  const samples = [0, -1, -2, -3, -4, -5, -6].flatMap((d) => wakeNight(d));
  const r = sleepQualityForToday(samples, NOW);
  assert.equal(r.isToday, true);
  assert.equal(r.wakeDate, keyOf(0));
  assert.ok(r.quality >= 85 && r.quality <= 100, String(r.quality)); // 470 de 480 min, estagios, eficiencia 94%
  assert.ok(r.confidence >= 0.99);
  assert.ok('debt' in r.parts && 'regularity' in r.parts);
});

test('antes de acordar: cai para a noite de ONTEM, marcada como provisoria', () => {
  const r = sleepQualityForToday(wakeNight(-1), NOW);
  assert.equal(r.isToday, false);
  assert.equal(r.wakeDate, keyOf(-1));
  assert.ok(r.quality != null);
});

test('mais antigo que ontem nao serve: null', () => {
  assert.equal(sleepQualityForToday(wakeNight(-2), NOW), null);
  assert.equal(sleepQualityForToday([], NOW), null);
  assert.equal(sleepQualityForToday(null, NOW), null);
});

test('so soneca hoje e noite de ontem: usa ontem (provisoria), a soneca nao vira "a noite"', () => {
  const r = sleepQualityForToday([...wakeNight(-1), sample(at(0, 9, 30), at(0, 9, 50), 1)], NOW);
  assert.equal(r.wakeDate, keyOf(-1));
  assert.equal(r.isToday, false);
});

test('a necessidade personalizada e repassada', () => {
  const samples = [0, -1, -2, -3].flatMap((d) => [sample(at(d - 1, 23, 0), at(d, 6, 0), 1)]); // 7 h por noite
  const a = sleepQualityForToday(samples, NOW, 8);
  const b = sleepQualityForToday(samples, NOW, 7);
  assert.ok(b.quality > a.quality);
  assert.equal(b.parts.duration, 100);
});

test('sono de amanha (relogio adiantado) nunca entra', () => {
  const r = sleepQualityForToday([...wakeNight(1), ...wakeNight(-1)], NOW);
  assert.equal(r.wakeDate, keyOf(-1));
});
