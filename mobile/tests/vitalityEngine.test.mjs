// Testes do motor da Vitalidade dinamica (services/vitalityEngine.ts): base congelada, referencias do dia, dia monotonico, provisorio. Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMPTY_STORED_STATE, candidateBase, isBaseFinal, runVitalityEngine } from '../services/vitalityEngine.ts';

const TODAY = '2026-11-17';
const YESTERDAY = '2026-11-16';
const at = (h, m = 0) => new Date(2026, 10, 17, h, m, 0);
const sleepToday = (quality = 90) => ({ quality, confidence: 1, parts: { duration: 95 }, isToday: true });
const sleepYesterday = (quality = 70) => ({ quality, confidence: 0.8, parts: {}, isToday: false });
const readiness = (over = {}) => ({ sleep_score: 80, load_score: 90, load_score_prior: 100, hr_score: 90, ...over });
const day = (over = {}) => ({ steps: 3000, activeKcal: 150, workouts: [], awakeHrElevation: 5, restHours: 2, napMinutes: 0, ...over });
const input = (over = {}) => ({
  now: at(15), todayKey: TODAY, yesterdayKey: YESTERDAY, sleep: sleepToday(), readiness: readiness(), day: day(), history: null, restHr: 60, stored: null, ...over,
});

// ------------------------------------------------------------------------------------------------------------------------ base final / candidata
test('base final: noite de hoje = final; so ontem = provisoria; sem noite = final so depois das 10h', () => {
  assert.equal(isBaseFinal({ isToday: true }, at(6)), true);
  assert.equal(isBaseFinal({ isToday: false }, at(15)), false);
  assert.equal(isBaseFinal(null, at(9, 59)), false);
  assert.equal(isBaseFinal(null, at(10)), true);
});

test('candidata: usa a carga dos 7 dias ANTERIORES (load_score_prior), nao a de hoje; sem prior cai em load_score (backend antigo)', () => {
  const withPrior = candidateBase(sleepToday(80), readiness({ load_score_prior: 100, load_score: 60, hr_score: 70 }));
  assert.equal(withPrior.base, 0.65 * 80 + 0.2 * 100 + 0.15 * 70); // 82.5
  const oldBackend = candidateBase(sleepToday(80), { load_score: 60, hr_score: 70 });
  assert.equal(oldBackend.base, 0.65 * 80 + 0.2 * 60 + 0.15 * 70);
});

test('candidata: sem qualidade do sono E sem FC nao ha base (so a carga nao basta)', () => {
  assert.equal(candidateBase(null, readiness({ hr_score: null })).base, null);
  assert.equal(candidateBase({ quality: null, confidence: 0, parts: {}, isToday: true }, readiness({ hr_score: null })).base, null);
  assert.ok(candidateBase(null, readiness()).base != null); // so FC + carga: sono neutro
  assert.equal(candidateBase(null, readiness()).partialSleep, true);
  assert.equal(candidateBase(sleepToday(), null).base, 0.65 * 90 / 0.65); // so o sono
});

// ------------------------------------------------------------------------------------------------------------------------------ fluxo
test('primeiro calculo do dia: congela a base, guarda referencias, totais e o valor mostrado', () => {
  const out = runVitalityEngine(input({ history: Array.from({ length: 7 }, () => ({ steps: 5000, activeKcal: 250, workouts: [] })) }));
  assert.equal(out.display.provisional, false);
  assert.equal(out.next.frozenBase.dayKey, TODAY);
  assert.equal(out.next.frozenBase.base, out.debug.base.used);
  assert.equal(out.next.refs.dayKey, TODAY);
  assert.equal(out.next.refs.value.steps, 5000);
  assert.equal(out.next.day.dayKey, TODAY);
  assert.deepEqual({ dayKey: out.next.lastShown.dayKey, score: out.next.lastShown.score }, { dayKey: TODAY, score: out.display.score });
  assert.equal(out.debug.base.frozen, true);
  assert.equal(out.debug.refsFromStorage, false);
});

test('base congelada: mesmo que o backend mude a carga/FC depois, o dia inteiro usa a base da manha', () => {
  const first = runVitalityEngine(input({ now: at(8) }));
  const base = first.next.frozenBase.base;
  const later = runVitalityEngine(input({ now: at(20), stored: first.next, readiness: readiness({ load_score_prior: 20, hr_score: 10 }), sleep: sleepToday(10) }));
  assert.equal(later.debug.base.used, base);
  assert.equal(later.debug.base.frozen, true);
  assert.equal(later.next.frozenBase.base, base);
});

test('base congelada de OUTRO dia e ignorada (congela a nova)', () => {
  const stored = { ...EMPTY_STORED_STATE, frozenBase: { dayKey: YESTERDAY, base: 33 } };
  const out = runVitalityEngine(input({ stored }));
  assert.notEqual(out.debug.base.used, 33);
  assert.equal(out.next.frozenBase.dayKey, TODAY);
});

test('referencias fixadas uma vez por dia: a segunda atualizacao usa as guardadas, mesmo com historico novo', () => {
  const first = runVitalityEngine(input({ history: Array.from({ length: 7 }, () => ({ steps: 5000, activeKcal: 250, workouts: [] })) }));
  const second = runVitalityEngine(input({ stored: first.next, history: Array.from({ length: 7 }, () => ({ steps: 12000, activeKcal: 900, workouts: [] })) }));
  assert.equal(second.debug.refs.steps, 5000);
  assert.equal(second.debug.refsFromStorage, true);
  assert.deepEqual(second.next.refs, first.next.refs);
});

test('sem historico lido: usa o fallback e NAO grava referencias (tenta de novo na proxima)', () => {
  const out = runVitalityEngine(input({ history: null }));
  assert.equal(out.debug.refs.steps, 6000);
  assert.deepEqual(out.debug.refs.fromHistory, { steps: false, kcal: false, eref: false });
  assert.equal(out.next.refs, null);
  const again = runVitalityEngine(input({ stored: out.next, history: Array.from({ length: 6 }, () => ({ steps: 4000, activeKcal: 200, workouts: [] })) }));
  assert.equal(again.debug.refs.steps, 4000);
  assert.equal(again.next.refs.dayKey, TODAY);
});

test('a FC de repouso guardada acompanha as referencias do dia', () => {
  const first = runVitalityEngine(input({ restHr: 55, history: Array.from({ length: 6 }, () => ({ steps: 4000, activeKcal: 200, workouts: [] })) }));
  const second = runVitalityEngine(input({ restHr: 70, stored: first.next }));
  assert.equal(second.debug.restHr, 55);
});

test('totais do dia so crescem: leitura menor ou falha nao recupera a Vitalidade', () => {
  const first = runVitalityEngine(input({ day: day({ steps: 9000, activeKcal: 450 }) }));
  const lagging = runVitalityEngine(input({ stored: first.next, day: day({ steps: 4000, activeKcal: 200 }) }));
  assert.equal(lagging.debug.day.steps, 9000);
  assert.ok(lagging.display.score <= first.display.score);
  const failed = runVitalityEngine(input({ stored: first.next, day: null }));
  assert.equal(failed.debug.day.steps, 9000);
  assert.equal(failed.display.score, lagging.display.score);
});

test('o valor mostrado cai com mais esforco e a suavizacao limita queda e subida', () => {
  const first = runVitalityEngine(input({ day: day({ steps: 500, activeKcal: 20 }) }));
  const heavy = runVitalityEngine(input({ stored: first.next, day: day({ steps: 30000, activeKcal: 1500 }) }));
  assert.ok(heavy.display.score < first.display.score);
  assert.ok(first.display.score - heavy.display.score <= 12);
  assert.ok(heavy.debug.raw < heavy.display.score + 0.5 || heavy.debug.raw <= first.display.score);
});

// ------------------------------------------------------------------------------------------------------------ antes de acordar / sem dados
test('antes de acordar (so a noite de ontem): provisorio, mostra o valor de ontem a noite e NAO congela a base', () => {
  const stored = { ...EMPTY_STORED_STATE, lastShown: { dayKey: YESTERDAY, score: 58 } };
  const out = runVitalityEngine(input({ now: at(6), sleep: sleepYesterday(), stored }));
  assert.equal(out.display.provisional, true);
  assert.equal(out.display.score, 58);
  assert.equal(out.next.frozenBase, null);
  assert.equal(out.debug.base.provisional, true);
  assert.equal(out.next.lastShown.score, 58); // o provisorio nao sobrescreve o ultimo valor real
  assert.equal(out.debug.result, null);
});

test('antes de acordar sem valor de ontem: usa a base provisoria; depois de acordar congela a final', () => {
  const before = runVitalityEngine(input({ now: at(6), sleep: sleepYesterday(70) }));
  assert.equal(before.display.provisional, true);
  assert.ok(before.display.score != null);
  const after = runVitalityEngine(input({ now: at(7, 30), sleep: sleepToday(85), stored: before.next }));
  assert.equal(after.display.provisional, false);
  assert.equal(after.next.frozenBase.dayKey, TODAY);
});

test('o valor de ontem so serve se for DE ONTEM (nao de anteontem)', () => {
  const stored = { ...EMPTY_STORED_STATE, lastShown: { dayKey: '2026-11-15', score: 58 } };
  const out = runVitalityEngine(input({ now: at(6), sleep: sleepYesterday(), stored }));
  assert.notEqual(out.display.score, 58);
});

test('sem dado nenhum: sem dados (null), nada inventado e nada congelado', () => {
  const out = runVitalityEngine(input({ sleep: null, readiness: null, day: null, now: at(15) }));
  assert.equal(out.display.score, null);
  assert.equal(out.display.state, 'nodata');
  assert.equal(out.next.frozenBase, null);
});

test('sem sono mas com FC e depois das 10h: base parcial (sono neutro) e congelada', () => {
  const out = runVitalityEngine(input({ sleep: null, now: at(11) }));
  assert.equal(out.debug.base.partialSleep, true);
  assert.equal(out.debug.base.final, true);
  assert.ok(out.display.score != null);
  assert.equal(out.next.frozenBase.dayKey, TODAY);
});

test('sem sono e antes das 10h: provisoria (a pessoa pode nao ter acordado)', () => {
  const out = runVitalityEngine(input({ sleep: null, now: at(8) }));
  assert.equal(out.display.provisional, true);
  assert.equal(out.next.frozenBase, null);
});

test('backend fora (readiness null) mas com sono do aparelho: ainda calcula, so a base do sono', () => {
  const out = runVitalityEngine(input({ readiness: null }));
  assert.ok(out.display.score != null);
  assert.equal(out.debug.base.hr, null);
});

test('estado guardado invalido ou de outra versao e ignorado sem quebrar', () => {
  for (const stored of [undefined, null, {}, { v: 2 }, 'x']) {
    const out = runVitalityEngine(input({ stored }));
    assert.equal(out.next.v, 1);
    assert.ok(out.display.score != null);
  }
});

test('um dia inteiro de atualizacoes: o valor mostrado nunca sobe mais de 2 e nunca cai mais de 12 entre atualizacoes', () => {
  let stored = null;
  let prev = null;
  for (let step = 0; step < 60; step += 1) {
    const out = runVitalityEngine(input({ now: at(7 + Math.floor(step / 4), (step % 4) * 15), stored, day: day({ steps: step * 220, activeKcal: step * 11 }) }));
    stored = out.next;
    if (prev != null) {
      assert.ok(out.display.score - prev <= 2, `subiu ${out.display.score - prev}`);
      assert.ok(prev - out.display.score <= 12, `caiu ${prev - out.display.score}`);
    }
    prev = out.display.score;
  }
});

// ------------------------------------------------------------------------------------------------------------ dono do estado (logout / troca de usuario)
import { storedStateForUser } from '../services/vitalityEngine.ts';

test('estado guardado de OUTRO usuario e ignorado: base congelada, referencias e ultimo valor nao passam para a outra pessoa', () => {
  const a = runVitalityEngine(input({ userId: 'user-A', history: Array.from({ length: 7 }, () => ({ steps: 5000, activeKcal: 250, workouts: [] })) }));
  assert.equal(a.next.userId, 'user-A');
  assert.ok(a.next.frozenBase);
  const b = runVitalityEngine(input({ userId: 'user-B', stored: a.next, sleep: sleepToday(40), readiness: readiness({ load_score_prior: 30, hr_score: 20 }) }));
  assert.notEqual(b.debug.base.used, a.debug.base.used); // recalcula a base de B, nao reaproveita a de A
  assert.equal(b.debug.refsFromStorage, false);
  assert.equal(b.next.userId, 'user-B');
  assert.equal(b.next.frozenBase.dayKey, TODAY);
  assert.equal(b.debug.yesterdayFinal, null);
});

test('estado do MESMO usuario continua valendo (base congelada reaproveitada)', () => {
  const first = runVitalityEngine(input({ userId: 'user-A' }));
  const again = runVitalityEngine(input({ userId: 'user-A', stored: first.next, sleep: sleepToday(10) }));
  assert.equal(again.debug.base.used, first.debug.base.used);
  assert.equal(again.next.userId, 'user-A');
});

test('estado antigo sem dono (builds anteriores) e aceito e passa a ser carimbado; sem usuario conhecido nao descarta nada', () => {
  const legacy = runVitalityEngine(input({ userId: null })).next; // userId null
  assert.equal(legacy.userId, null);
  const stamped = runVitalityEngine(input({ userId: 'user-A', stored: legacy }));
  assert.equal(stamped.debug.base.used, runVitalityEngine(input({ userId: null })).debug.base.used);
  assert.equal(stamped.next.userId, 'user-A');
  const noUser = runVitalityEngine(input({ userId: null, stored: stamped.next }));
  assert.equal(noUser.next.userId, 'user-A'); // nao perde o dono
  assert.equal(noUser.debug.base.used, stamped.debug.base.used);
});

test('storedStateForUser: bordas', () => {
  const s = { ...EMPTY_STORED_STATE, userId: 'A', frozenBase: { dayKey: TODAY, base: 80 } };
  assert.equal(storedStateForUser(s, 'A'), s);
  assert.equal(storedStateForUser(s, 'B'), EMPTY_STORED_STATE);
  assert.equal(storedStateForUser(s, null), s);
  const legacy = { ...s, userId: null };
  assert.equal(storedStateForUser(legacy, 'B'), legacy); // sem dono gravado: aceito
  for (const bad of [null, undefined, {}, { v: 2 }]) assert.equal(storedStateForUser(bad, 'A'), EMPTY_STORED_STATE);
});

// ------------------------------------------------------------------------------------------------------------ referencias: so fixa as do historico
const emptyDays = (n) => Array.from({ length: n }, () => ({ steps: null, activeKcal: null, workouts: [] }));
const days = (n, over = {}) => Array.from({ length: n }, () => ({ steps: 5000, activeKcal: 250, workouts: [], ...over }));

test('historico lido mas SEM dados (fallback): nao fixa as referencias do dia e tenta de novo na proxima atualizacao', () => {
  const first = runVitalityEngine(input({ history: emptyDays(14) }));
  assert.equal(first.debug.refs.steps, 6000);
  assert.deepEqual(first.debug.refs.fromHistory, { steps: false, kcal: false, eref: false });
  assert.equal(first.next.refs, null);
  const second = runVitalityEngine(input({ stored: first.next, history: days(7) }));
  assert.equal(second.debug.refs.steps, 5000);
  assert.equal(second.debug.refsFromStorage, false);
  assert.equal(second.next.refs.dayKey, TODAY);
  const third = runVitalityEngine(input({ stored: second.next, history: emptyDays(14) }));
  assert.equal(third.debug.refs.steps, 5000); // agora fixa: nao volta ao fallback
  assert.equal(third.debug.refsFromStorage, true);
});

test('menos de 5 dias com dado tambem e fallback e nao fixa', () => {
  const out = runVitalityEngine(input({ history: days(4) }));
  assert.equal(out.next.refs, null);
});

test('so passos OU so calorias do historico ja bastam para fixar', () => {
  const stepsOnly = runVitalityEngine(input({ history: days(6, { activeKcal: null }) }));
  assert.deepEqual({ s: stepsOnly.debug.refs.fromHistory.steps, k: stepsOnly.debug.refs.fromHistory.kcal }, { s: true, k: false });
  assert.equal(stepsOnly.next.refs.dayKey, TODAY);
  const kcalOnly = runVitalityEngine(input({ history: days(6, { steps: null }) }));
  assert.deepEqual({ s: kcalOnly.debug.refs.fromHistory.steps, k: kcalOnly.debug.refs.fromHistory.kcal }, { s: false, k: true });
  assert.equal(kcalOnly.next.refs.dayKey, TODAY);
});

test('so treino do historico (Eref) sem passos nem calorias NAO fixa', () => {
  const out = runVitalityEngine(input({ history: days(6, { steps: null, activeKcal: null, workouts: [{ minutes: 60 }] }) }));
  assert.equal(out.debug.refs.fromHistory.eref, true);
  assert.equal(out.next.refs, null);
});

test('referencias de ontem guardadas nao impedem o calculo de hoje', () => {
  const stored = { ...EMPTY_STORED_STATE, refs: { dayKey: YESTERDAY, value: { steps: 9999, kcal: 999, eref: 99, fromHistory: { steps: true, kcal: true, eref: true } }, restHr: 50 } };
  const out = runVitalityEngine(input({ stored, history: emptyDays(14) }));
  assert.equal(out.debug.refs.steps, 6000); // fallback de hoje, nao as de ontem
  assert.equal(out.next.refs.dayKey, YESTERDAY); // continua com as de ontem guardadas (nada novo para fixar)
});
