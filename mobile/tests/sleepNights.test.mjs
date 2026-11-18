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
    return buildSleepNightsForQuality([sample(start, new Date(start.getTime() + 240 * 60000), 1)]).length; // 4 h: acima do limite de trecho parcial (180 min)
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

// ------------------------------------------------------------------------------------------------ wakeAt e sonecas de hoje
import { napMinutesToday } from '../services/sleepNights.ts';

test('a noite devolve o instante em que acordou (fim do ultimo trecho de sono)', () => {
  const nights = buildSleepNightsForQuality(wakeNight(0));
  assert.equal(nights[0].wakeAt, at(0, 7, 0).toISOString());
  assert.equal(sleepQualityForToday(wakeNight(0), NOW).wakeAt, at(0, 7, 0).toISOString());
});

test('sonecas de hoje: soma so as sessoes das 9h as 20h que terminam hoje', () => {
  const nap = [sample(at(0, 9, 10), at(0, 9, 40), 1)];
  assert.equal(napMinutesToday(nap, NOW), 30);
  assert.equal(napMinutesToday([...nap, sample(at(0, 9, 55), at(0, 10, 0), 1)], at(0, 18, 0)), 35); // 9:10-9:40 e 9:55-10:00: a pausa e curta (mesma sessao) e a soma e 30 + 5
  assert.equal(napMinutesToday(wakeNight(0), NOW), 0); // a noite nao e soneca
  assert.equal(napMinutesToday([sample(at(-1, 14, 0), at(-1, 14, 30), 1)], NOW), 0); // soneca de ontem
  assert.equal(napMinutesToday([sample(at(0, 14, 0), at(0, 14, 40), 1)], at(0, 10, 0)), 0); // ainda nao aconteceu
  assert.equal(napMinutesToday([], NOW), 0);
  assert.equal(napMinutesToday(null, NOW), 0);
});

// ------------------------------------------------------------------------------------------------ leitura de sono do CICLO (ancora de acordar)
import { CYCLE_LOOKBACK_HOURS, napMinutesSince, sleepCycleReading } from '../services/sleepNights.ts';

// Caso real: noite 02:20-11:54 do dia 16 (offset -1 em relacao a NOW = 17/11 10:00), com estagios.
function lateNight(dayOffset) {
  return [
    sample(at(dayOffset, 2, 20), at(dayOffset, 4, 0), 3),
    sample(at(dayOffset, 4, 0), at(dayOffset, 5, 10), 4),
    sample(at(dayOffset, 5, 10), at(dayOffset, 8, 0), 3),
    sample(at(dayOffset, 8, 0), at(dayOffset, 8, 26), 2),
    sample(at(dayOffset, 8, 26), at(dayOffset, 10, 0), 5),
    sample(at(dayOffset, 10, 0), at(dayOffset, 11, 54), 3),
    sample(at(dayOffset, 2, 10), at(dayOffset, 12, 4), 0, 'iphone'),
  ];
}

test('ciclo: a noite 02:20-11:54 de ontem e a ancora as 00:05 de hoje (a meia-noite nao a "expira")', () => {
  const midnightPlus = at(0, 0, 5);
  const reading = sleepCycleReading(lateNight(-1), midnightPlus);
  assert.equal(reading.wakeAt, at(-1, 11, 54).toISOString());
  assert.equal(reading.wakeDate, keyOf(-1)); // dia em que ACORDOU, nao o de hoje
  assert.equal(reading.isToday, false);
  assert.ok(Math.abs(reading.asleepMin - (9 * 60 + 8)) < 1, String(reading.asleepMin)); // 9h34 na cama menos 26 min acordado
  assert.ok(reading.quality != null);
  // a regra antiga do "dia civil" trata a mesma noite como ontem (provisoria): continua assim, so nao e mais ela que ancora o ciclo
  assert.equal(sleepQualityForToday(lateNight(-1), midnightPlus).isToday, false);
});

test('ciclo: a noite de hoje vira a ancora assim que o acordar passa; antes disso vale a anterior', () => {
  const samples = [...wakeNight(-1), ...wakeNight(0)];
  assert.equal(sleepCycleReading(samples, at(0, 6, 59)).wakeAt, at(-1, 7, 0).toISOString()); // ainda dormindo
  assert.equal(sleepCycleReading(samples, at(0, 7, 1)).wakeAt, at(0, 7, 0).toISOString());
  assert.equal(sleepCycleReading(samples, at(0, 7, 1)).isToday, true);
});

test('ciclo: soneca nao e ancora; so a noite principal', () => {
  const nap = [sample(at(0, 14, 0), at(0, 14, 40), 1)];
  const reading = sleepCycleReading([...wakeNight(0), ...nap], at(0, 18));
  assert.equal(reading.wakeAt, at(0, 7, 0).toISOString());
  assert.equal(sleepCycleReading(nap, at(0, 18)), null);
});

test('ciclo: acordou ha mais de 36 h (ou sem noite) = sem ancora', () => {
  assert.equal(CYCLE_LOOKBACK_HOURS, 36);
  const wake = at(-2, 7, 0).getTime();
  const justInside = new Date(wake + 36 * 3600000);
  const justOutside = new Date(wake + 36 * 3600000 + 60000);
  assert.ok(sleepCycleReading(wakeNight(-2), justInside) != null);
  assert.equal(sleepCycleReading(wakeNight(-2), justOutside), null);
  assert.equal(sleepCycleReading([], NOW), null);
  assert.equal(sleepCycleReading(null, NOW), null);
});

test('ciclo: noite com acordar no futuro (relogio atrasado) nao entra', () => {
  assert.equal(sleepCycleReading(wakeNight(1), NOW), null);
});

test('ciclo: a divida e a regularidade usam as noites ate a escolhida', () => {
  const samples = [-6, -5, -4, -3, -2, -1].flatMap((d) => lateNight(d));
  const r = sleepCycleReading(samples, at(0, 0, 5));
  assert.ok('debt' in r.parts && 'regularity' in r.parts);
});

test('sonecas desde a ancora: so as iniciadas depois dela e ja terminadas', () => {
  const anchor = at(0, 6, 0).getTime();
  const naps = [sample(at(0, 15, 0), at(0, 15, 30), 1), sample(at(-1, 14, 0), at(-1, 14, 30), 1), sample(at(0, 21, 0), at(0, 21, 20), 1)];
  assert.equal(napMinutesSince(naps, anchor, at(0, 18, 0)), 30); // a de ontem fica de fora e a das 21h ainda nao aconteceu
  assert.equal(napMinutesSince(naps, anchor, at(0, 23, 0)), 30); // a das 21h comeca depois de 20h: e noite, nao soneca
  assert.equal(napMinutesSince(naps, at(-1, 0, 0).getTime(), at(0, 18, 0)), 60); // com a ancora de ontem, as duas contam
  assert.equal(napMinutesSince([], anchor, NOW), 0);
  assert.equal(napMinutesSince(null, anchor, NOW), 0);
});

// ------------------------------------------------------------------------------------------------ selecao da noite da tela (ignora trecho parcial)
import { PARTIAL_SLEEP_MAX_MINUTES, SLEEP_SCREEN_LOOKBACK_HOURS, describeSleepSessions, lastNightSleepHoursFromSamples, selectSleepNightForScreen, sleepHoursWokenTodayFromSamples } from '../services/sleepNights.ts';
import { buildSleepNight } from '../services/healthkitState.ts';

const HOUR = 3600 * 1000;

test('janela da tela: 72 h (antes 32 h) e limite de trecho parcial de 180 min', () => {
  assert.equal(SLEEP_SCREEN_LOOKBACK_HOURS, 72);
  assert.equal(PARTIAL_SLEEP_MAX_MINUTES, 180);
});

test('so um trecho parcial (sem estagios, < 3 h): nao ha noite, a tela fica "aguardando" com o trecho', () => {
  const fragment = [sample(at(0, 2, 0), at(0, 4, 2), 1)]; // 2h02 sem estagios, comeca de madrugada (nao e soneca)
  const r = selectSleepNightForScreen(fragment, NOW);
  assert.equal(r.night, null);
  assert.equal(r.partial.spanMin, 122);
  assert.equal(r.partial.startAt, at(0, 2, 0).toISOString());
  assert.equal(lastNightSleepHoursFromSamples(fragment, NOW), null);
  assert.deepEqual(buildSleepNightsForQuality(fragment), []);
});

test('trecho parcial mais novo que a ultima noite completa: mostra a noite completa e devolve o trecho para a faixa de aviso', () => {
  const samples = [...wakeNight(-1), sample(at(0, 2, 0), at(0, 4, 2), 1)];
  const r = selectSleepNightForScreen(samples, NOW);
  assert.equal(r.night.wakeDate, keyOf(-1));
  assert.equal(r.partial.endAt, at(0, 4, 2).toISOString());
  assert.equal(r.partial.spanMin, 122);
  // Home: continua sendo a noite completa de ontem, nao o trecho de hoje
  assert.ok(Math.abs(lastNightSleepHoursFromSamples(samples, NOW) * 60 - r.night.asleepMin) < 1e-6);
  assert.equal(sleepHoursWokenTodayFromSamples(samples, NOW), null);
});

test('trecho parcial MAIS ANTIGO que a noite completa nao gera aviso', () => {
  const samples = [sample(at(-2, 2, 0), at(-2, 4, 0), 1), ...wakeNight(0)];
  const r = selectSleepNightForScreen(samples, NOW);
  assert.equal(r.night.wakeDate, keyOf(0));
  assert.equal(r.partial, null);
});

test('noite curta COM estagios continua valida (nao e trecho parcial)', () => {
  const short = [sample(at(0, 3, 0), at(0, 4, 0), 3), sample(at(0, 4, 0), at(0, 5, 0), 4)]; // 2 h com estagios
  const r = selectSleepNightForScreen(short, NOW);
  assert.ok(r.night);
  assert.equal(r.night.asleepMin, 120);
  assert.equal(r.partial, null);
  assert.equal(lastNightSleepHoursFromSamples(short, NOW), 2);
});

test('sono curto SEM estagios mas de 3 h ou mais e noite', () => {
  const r = selectSleepNightForScreen([sample(at(0, 1, 0), at(0, 4, 0), 1)], NOW);
  assert.ok(r.night);
  assert.equal(r.night.asleepMin, 180);
});

test('trecho que comeca fora de 9h-20h e curto sem estagios nao vira noite principal (nem ancora)', () => {
  const samples = [...wakeNight(-1), sample(at(0, 0, 10), at(0, 1, 40), 1)]; // 00:10-01:40: noite, mas parcial
  assert.equal(buildSleepNightsForQuality(samples).length, 1);
  assert.equal(selectSleepNightForScreen(samples, NOW).night.wakeDate, keyOf(-1));
  const reading = sleepCycleReading(samples, NOW);
  assert.equal(reading.wakeAt, at(-1, 7, 0).toISOString()); // o ciclo segue ancorado na noite completa
});

test('cauda de uma noite cortada pelo inicio da janela: janela longa devolve a noite inteira, a curta nao devolve noite', () => {
  const full = lateNight(-1); // 16/11 02:20-11:54
  const nowMid = NOW; // 17/11 10:00
  const cut = (hours) => full.filter((s) => s.startDate.getTime() >= nowMid.getTime() - hours * HOUR);
  // 32 h: a janela comeca em 16/11 02:00, entao ainda pega tudo; o corte de 22 h (16/11 12:00) deixa so... nada; o de 24,1 h pega so a cauda
  const tail = full.filter((s) => s.startDate.getTime() >= at(-1, 9, 52).getTime());
  assert.equal(selectSleepNightForScreen(tail, NOW).night, null); // cauda 10:00-11:54 comeca na faixa de soneca: nao e "a noite"
  const whole = selectSleepNightForScreen(cut(SLEEP_SCREEN_LOOKBACK_HOURS), NOW);
  assert.equal(whole.night.wakeDate, keyOf(-1));
  assert.ok(Math.abs(whole.night.asleepMin - (9 * 60 + 8)) < 1, String(whole.night.asleepMin));
  assert.equal(whole.partial, null);
});

test('a tela e a Home mostram o MESMO total para a mesma noite (uniao dos intervalos do mesmo grupo)', () => {
  const samples = [...lateNight(-1), ...wakeNight(-2)];
  const { night } = selectSleepNightForScreen(samples, NOW);
  const detail = buildSleepNight(night.samples);
  assert.equal(Math.round(detail.breakdown.totalAsleepMinutes), Math.round(night.asleepMin));
  assert.ok(Math.abs(lastNightSleepHoursFromSamples(samples, NOW) * 60 - detail.breakdown.totalAsleepMinutes) < 1e-6);
});

test('diagnostico: cada sessao vem classificada (noite, soneca, parcial)', () => {
  const samples = [...wakeNight(-1), sample(at(-1, 14, 0), at(-1, 14, 40), 1), sample(at(0, 2, 0), at(0, 4, 2), 1)];
  const kinds = describeSleepSessions(samples).map((s) => s.kind);
  assert.deepEqual(kinds, ['night', 'nap', 'partial']);
  const night = describeSleepSessions(samples)[0];
  assert.equal(night.hasStages, true);
  assert.ok(night.values.includes(3) && night.sources.includes('watch'));
});

test('ciclo: so um trecho parcial nao ancora (sem ancora/estimado); uma noite completa antiga dentro de 36 h segue valendo', () => {
  const fragment = [sample(at(0, 2, 0), at(0, 4, 2), 1)];
  assert.equal(sleepCycleReading(fragment, NOW), null);
  const withNight = [...wakeNight(-1), ...fragment];
  assert.equal(sleepCycleReading(withNight, NOW).wakeAt, at(-1, 7, 0).toISOString());
  assert.equal(sleepCycleReading(withNight, at(0, 4, 3)).wakeAt, at(-1, 7, 0).toISOString());
});
