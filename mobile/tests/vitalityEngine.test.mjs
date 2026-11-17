// Testes do motor da Vitalidade (services/vitalityEngine.ts): CICLO ancorado no acordar (nao reinicia a meia-noite), base congelada do ciclo, desgaste por tempo,
// ancora persistida, falta de dado nunca eleva o valor, dono do estado. Rodar: `npm test` (Node 24).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANCHOR_MAX_AGE_HOURS,
  EMPTY_STORED_STATE,
  candidateBase,
  cycleKeyFor,
  resolveCycleAnchor,
  runVitalityEngine,
  storedStateForUser,
} from '../services/vitalityEngine.ts';

const H = 3600000;
const at = (dayOffset, h, m = 0) => new Date(2026, 10, 17 + dayOffset, h, m, 0);
const keyOf = (d) => `2026-11-${String(d.getDate()).padStart(2, '0')}`;
const sleepWake = (wake, quality = 90) => ({ quality, confidence: 1, parts: { duration: 95 }, wakeAt: wake.toISOString(), asleepMin: 540 });
const readiness = (over = {}) => ({ sleep_score: 80, load_score: 90, load_score_prior: 100, hr_score: 90, ...over });
const day = (over = {}) => ({ steps: 3000, activeKcal: 150, workouts: [], awakeHrElevation: 5, restHours: 2, napMinutes: 0, ...over });
const HISTORY = Array.from({ length: 7 }, () => ({ steps: 5000, activeKcal: 250, workouts: [] }));
const input = (over = {}) => {
  const now = over.now ?? at(0, 15);
  return { now, todayKey: keyOf(now), sleep: sleepWake(at(0, 6)), readiness: readiness(), day: day(), history: null, restHr: 60, stored: null, ...over };
};

// ----------------------------------------------------------------------------------------------------------------------------------- ancora
test('ancora: a noite lida agora vale; a guardada vale ate 24 h; a mais recente ganha', () => {
  const now = at(0, 15);
  assert.deepEqual(resolveCycleAnchor(at(0, 6).toISOString(), null, now), { anchorMs: at(0, 6).getTime(), source: 'sleep' });
  assert.deepEqual(resolveCycleAnchor(null, { wakeAt: at(0, 6).toISOString() }, now), { anchorMs: at(0, 6).getTime(), source: 'persisted' });
  assert.equal(ANCHOR_MAX_AGE_HOURS, 24);
  // guardada mais nova que a lida (leitura parcial devolveu uma noite antiga): fica a guardada
  assert.equal(resolveCycleAnchor(at(-1, 7).toISOString(), { wakeAt: at(0, 6).toISOString() }, now).source, 'persisted');
  assert.equal(resolveCycleAnchor(at(0, 6).toISOString(), { wakeAt: at(-1, 7).toISOString() }, now).source, 'sleep');
});

test('ancora guardada com mais de 24 h, no futuro ou invalida e ignorada (sem ancora)', () => {
  const now = at(0, 15);
  const expired = new Date(now.getTime() - 24 * H - 1000).toISOString();
  assert.equal(resolveCycleAnchor(null, { wakeAt: expired }, now).source, 'none');
  assert.equal(resolveCycleAnchor(null, { wakeAt: new Date(now.getTime() - 24 * H).toISOString() }, now).source, 'persisted'); // exatamente 24 h ainda vale
  assert.equal(resolveCycleAnchor(null, { wakeAt: at(0, 23).toISOString() }, now).source, 'none'); // acordar no futuro
  assert.equal(resolveCycleAnchor('nao e data', { wakeAt: 'tambem nao' }, now).source, 'none');
  assert.equal(resolveCycleAnchor(at(0, 23).toISOString(), null, now).source, 'none');
  assert.deepEqual(resolveCycleAnchor(undefined, undefined, now), { anchorMs: null, source: 'none' });
});

test('chave do ciclo: a propria ancora (ISO); sem ancora, uma chave do dia', () => {
  const ms = at(0, 6).getTime();
  assert.equal(cycleKeyFor(ms, '2026-11-17'), new Date(ms).toISOString());
  assert.equal(cycleKeyFor(null, '2026-11-17'), 'sem-ancora:2026-11-17');
});

// ------------------------------------------------------------------------------------------------------------------------ base candidata
test('candidata: usa a carga dos 7 dias ANTERIORES (load_score_prior); sem prior cai em load_score', () => {
  const s = sleepWake(at(0, 6), 80);
  assert.equal(candidateBase(s, readiness({ load_score_prior: 100, load_score: 60, hr_score: 70 })).base, 0.65 * 80 + 0.2 * 100 + 0.15 * 70);
  assert.equal(candidateBase(s, { load_score: 60, hr_score: 70 }).base, 0.65 * 80 + 0.2 * 60 + 0.15 * 70);
});

test('candidata: sem qualidade do sono E sem FC nao ha base (so a carga nao basta)', () => {
  assert.equal(candidateBase(null, readiness({ hr_score: null })).base, null);
  assert.ok(candidateBase(null, readiness()).base != null);
  assert.equal(candidateBase(null, readiness()).partialSleep, true);
  assert.equal(candidateBase(sleepWake(at(0, 6)), null).base, 90);
});

// ------------------------------------------------------------------------------------------------------------------------ ciclo e congelamento
test('primeiro calculo do ciclo: congela a base na chave da ancora e guarda ancora, referencias e totais', () => {
  const out = runVitalityEngine(input({ history: HISTORY }));
  const key = at(0, 6).toISOString();
  assert.equal(out.debug.cycle.key, key);
  assert.equal(out.debug.cycle.anchorSource, 'sleep');
  assert.equal(out.next.frozenBase.dayKey, key);
  assert.equal(out.next.refs.dayKey, key);
  assert.equal(out.next.day.dayKey, key);
  assert.equal(out.next.lastShown.dayKey, key);
  assert.equal(out.next.anchor.wakeAt, key);
  assert.equal(out.estimated, false);
  assert.equal(out.debug.base.frozen, true);
});

test('base congelada no ciclo: o backend pode mudar depois, o ciclo inteiro usa a base do acordar', () => {
  const first = runVitalityEngine(input({ now: at(0, 8) }));
  const later = runVitalityEngine(input({ now: at(0, 20), stored: first.next, readiness: readiness({ load_score_prior: 20, hr_score: 10 }), sleep: sleepWake(at(0, 6), 10) }));
  assert.equal(later.debug.base.used, first.next.frozenBase.base);
  assert.equal(later.next.frozenBase.base, first.next.frozenBase.base);
});

test('MEIA-NOITE NAO REINICIA: o ciclo que comecou as 12:00 segue o mesmo apos 00:00 (mesma chave, mesma base, desgaste por tempo so cresce)', () => {
  const wake = at(0, 12);
  const before = runVitalityEngine(input({ now: at(0, 23, 50), todayKey: keyOf(at(0, 23, 50)), sleep: sleepWake(wake), day: day({ steps: 1500, activeKcal: 70 }), history: HISTORY }));
  const after = runVitalityEngine(input({ now: at(1, 0, 10), sleep: sleepWake(wake), stored: before.next, day: day({ steps: 1600, activeKcal: 75 }) }));
  assert.equal(before.debug.todayKey, '2026-11-17');
  assert.equal(after.debug.todayKey, '2026-11-18'); // o calendario virou...
  assert.equal(after.debug.cycle.key, before.debug.cycle.key); // ...o ciclo nao
  assert.equal(after.debug.base.used, before.debug.base.used);
  assert.equal(after.debug.refsFromStorage, true);
  assert.ok(after.debug.result.wear.time > before.debug.result.wear.time);
  assert.ok(after.display.score <= before.display.score); // so desce
  assert.ok(before.display.score - after.display.score <= 2);
  assert.notEqual(after.display.state, 'nodata');
  assert.equal(after.estimated, false);
});

test('a leitura de sono que so conhece a noite anterior nao trata a virada do dia como "ontem provisorio": o ciclo continua com o valor calculado', () => {
  // as 00:05, a noite que acordou as 11:54 de ontem ainda e a ancora (nao ha noite nova): nada de "provisorio" nem de valor congelado de ontem
  const wake = at(0, 11, 54);
  const out = runVitalityEngine(input({ now: at(1, 0, 5), sleep: sleepWake(wake), history: HISTORY, day: day({ steps: 1800, activeKcal: 80 }) }));
  assert.equal(out.debug.cycle.anchorSource, 'sleep');
  assert.ok(Math.abs(out.debug.cycle.awakeMinutes - (12 * 60 + 11)) < 1);
  assert.ok(out.display.score > 40 && out.display.score < 70, String(out.display.score)); // ~12 h acordado, sentado
});

test('noite nova = ciclo novo: base nova congelada, referencias novas e o valor volta a subir', () => {
  const cycle1 = runVitalityEngine(input({ now: at(0, 23), sleep: sleepWake(at(0, 6)), history: HISTORY, day: day({ steps: 7000, activeKcal: 320 }) }));
  assert.ok(cycle1.display.score < 60);
  const cycle2 = runVitalityEngine(input({ now: at(1, 7, 30), sleep: sleepWake(at(1, 7)), stored: cycle1.next, history: HISTORY, day: day({ steps: 200, activeKcal: 8 }) }));
  assert.equal(cycle2.debug.cycle.key, at(1, 7).toISOString());
  assert.notEqual(cycle2.debug.cycle.key, cycle1.debug.cycle.key);
  assert.ok(cycle2.display.score > cycle1.display.score + 20); // novo ciclo: nao e suavizado contra o anterior
  assert.equal(cycle2.next.frozenBase.dayKey, cycle2.debug.cycle.key);
  assert.equal(cycle2.debug.refsFromStorage, false);
});

// ----------------------------------------------------------------------------------------------------------------------- desgaste por tempo
test('tempo acordado desgasta 2,5 pontos por hora desde a ancora, com teto de 40 por ciclo', () => {
  const wake = at(0, 6);
  const timeAt = (h) => runVitalityEngine(input({ now: new Date(wake.getTime() + h * H), sleep: sleepWake(wake), day: day({ steps: 0, activeKcal: 0 }) })).debug.result.wear.time;
  assert.equal(timeAt(0), 0);
  assert.equal(timeAt(4), 10);
  assert.equal(timeAt(12), 30);
  assert.equal(timeAt(16), 40);
  assert.equal(timeAt(40), 40); // teto
});

test('o valor desce com as horas (monotonico) e nunca sai de 0-100 nem passa da base', () => {
  const wake = at(0, 6);
  let stored = null;
  let prev = null;
  for (let step = 0; step <= 40 * 4; step += 1) {
    const now = new Date(wake.getTime() + step * 15 * 60000);
    const out = runVitalityEngine(input({ now, sleep: sleepWake(wake), stored, day: day({ steps: 100, activeKcal: 5 }) }));
    stored = out.next;
    const v = out.display.score;
    assert.ok(v >= 0 && v <= 100);
    assert.ok(v <= out.debug.base.used + 1e-9);
    if (prev != null) assert.ok(v <= prev, `subiu em ${step}`);
    prev = v;
  }
});

test('cochilo abate tempo acordado (minutos dormidos + credito) e a Vitalidade e maior que sem cochilo', () => {
  const wake = at(0, 6);
  const now = at(0, 20);
  const base = input({ now, sleep: sleepWake(wake), day: day({ steps: 4000, activeKcal: 180, napMinutes: 0 }) });
  const without = runVitalityEngine(base);
  const withNap = runVitalityEngine({ ...base, day: day({ steps: 4000, activeKcal: 180, napMinutes: 30 }) });
  assert.equal(without.debug.cycle.awakeMinutes, 14 * 60);
  assert.equal(withNap.debug.cycle.awakeMinutes, 14 * 60 - 45); // 30 min x (1 + 0,5)
  assert.ok(withNap.debug.result.wear.time < without.debug.result.wear.time);
  assert.ok(withNap.display.score > without.display.score);
});

test('ficar sentado NAO recupera o desgaste por tempo (so o esforco), mas dormir/cochilar sim', () => {
  const wake = at(0, 12);
  const now = at(1, 0);
  const sat = runVitalityEngine(input({ now, sleep: sleepWake(wake), day: day({ steps: 1300, activeKcal: 60, restHours: 12 }) }));
  assert.ok(sat.debug.result.recovery <= 0.35 * (sat.debug.result.wear.movement + sat.debug.result.wear.heartRate) + 1e-9);
  assert.ok(sat.debug.result.recovery < 2);
});

// ------------------------------------------------------------------------------------------------------------- sem dado de sono (sem ancora)
test('sem noite e sem ancora guardada: NAO aplica desgaste por tempo, marca "estimado/sem sono" e nao congela a base', () => {
  const out = runVitalityEngine(input({ sleep: null }));
  assert.equal(out.debug.cycle.anchorSource, 'none');
  assert.equal(out.debug.cycle.anchorAt, null);
  assert.equal(out.debug.cycle.awakeMinutes, null);
  assert.equal(out.debug.result.wear.time, 0);
  assert.equal(out.estimated, true);
  assert.deepEqual(out.debug.cycle.estimatedReasons, ['sem_sono']);
  assert.equal(out.next.frozenBase, null); // o sono pode chegar depois
  assert.equal(out.debug.base.partialSleep, true);
  assert.equal(out.debug.cycle.key, 'sem-ancora:2026-11-17');
});

test('sem sono, a Vitalidade NAO sobe por causa disso: nunca passa do ultimo valor mostrado nas ultimas 24 h', () => {
  const withSleep = runVitalityEngine(input({ now: at(0, 20), sleep: sleepWake(at(0, 6)), day: day({ steps: 6000, activeKcal: 270 }), history: HISTORY }));
  const lowest = withSleep.display.score;
  assert.ok(lowest < 60);
  // a leitura de sono some e a ancora guardada expirou: sem a trava, o desgaste por tempo (35 pontos) sumiria e o valor subiria
  const later = new Date(at(0, 20).getTime() + 25 * H);
  const lost = runVitalityEngine(input({ now: later, sleep: null, stored: { ...withSleep.next, updatedAt: later.getTime() - 2 * H }, day: day({ steps: 6000, activeKcal: 270 }) }));
  assert.equal(lost.debug.cycle.anchorSource, 'none');
  assert.ok(lost.display.score <= lowest, `${lost.display.score} > ${lowest}`);
  assert.equal(lost.debug.cycle.cappedBy, lowest);
  assert.equal(lost.estimated, true);
});

test('sem sono e sem valor anterior: calcula so como estimativa (sem desgaste por tempo), nunca como se fosse um ciclo real', () => {
  const out = runVitalityEngine(input({ sleep: null, day: day({ steps: 2000, activeKcal: 90 }) }));
  assert.ok(out.display.score != null);
  assert.equal(out.debug.cycle.cappedBy, null);
  assert.equal(out.estimated, true);
});

test('sem sono e sem FC: sem base, sem dados (nada inventado)', () => {
  const out = runVitalityEngine(input({ sleep: null, readiness: null }));
  assert.equal(out.display.score, null);
  assert.equal(out.display.state, 'nodata');
  assert.equal(out.next.frozenBase, null);
});

// ------------------------------------------------------------------------------------------------------------------- ancora persistida
test('a ancora e guardada e sobrevive a reinicio do app: sem leitura de sono, o ciclo segue pela ancora guardada (ate 24 h)', () => {
  const first = runVitalityEngine(input({ now: at(0, 10), sleep: sleepWake(at(0, 6)), history: HISTORY }));
  assert.equal(first.next.anchor.wakeAt, at(0, 6).toISOString());
  // app reaberto (estado carregado do disco), sem ler o sono
  const reopened = runVitalityEngine(input({ now: at(0, 18), sleep: null, stored: JSON.parse(JSON.stringify(first.next)), day: day({ steps: 4000, activeKcal: 180 }) }));
  assert.equal(reopened.debug.cycle.anchorSource, 'persisted');
  assert.equal(reopened.debug.cycle.key, first.debug.cycle.key);
  assert.equal(reopened.debug.base.used, first.debug.base.used);
  assert.ok(Math.abs(reopened.debug.cycle.awakeMinutes - 12 * 60) < 1);
  assert.equal(reopened.estimated, false); // ha ancora: nao e "sem sono"
  assert.equal(reopened.next.anchor.wakeAt, first.next.anchor.wakeAt);
});

test('a ancora guardada atravessa a virada do dia e expira depois de 24 h', () => {
  const first = runVitalityEngine(input({ now: at(0, 13), sleep: sleepWake(at(0, 12)), history: HISTORY }));
  const nextMorning = runVitalityEngine(input({ now: at(1, 8), sleep: null, stored: first.next, day: day({ steps: 2500, activeKcal: 110 }) }));
  assert.equal(nextMorning.debug.cycle.anchorSource, 'persisted'); // 20 h depois
  const expired = runVitalityEngine(input({ now: at(1, 13), sleep: null, stored: first.next, day: day({ steps: 2500, activeKcal: 110 }) })); // 25 h
  assert.equal(expired.debug.cycle.anchorSource, 'none');
  assert.equal(expired.estimated, true);
});

test('ancora guardada de OUTRO usuario e ignorada', () => {
  const a = runVitalityEngine(input({ userId: 'A', sleep: sleepWake(at(0, 6)), history: HISTORY }));
  const b = runVitalityEngine(input({ userId: 'B', sleep: null, stored: a.next }));
  assert.equal(b.debug.cycle.anchorSource, 'none');
  assert.equal(b.next.userId, 'B');
});

// ---------------------------------------------------------------------------------------------------------------- falta de movimento
test('sem leitura de passos/calorias (falha do HealthKit): o valor NAO sobe, fica travado no ultimo do ciclo', () => {
  const first = runVitalityEngine(input({ now: at(0, 16), day: day({ steps: 9000, activeKcal: 420 }), history: HISTORY }));
  const failed = runVitalityEngine(input({ now: at(0, 16, 5), stored: first.next, day: null }));
  assert.ok(failed.display.score <= first.display.score);
  // o que o ciclo ja viu (9000 passos) continua valendo: a leitura vazia nao apaga nem conta como "sem movimento"
  const nulls = runVitalityEngine(input({ now: at(0, 16, 5), stored: first.next, day: { steps: null, activeKcal: null, workouts: [] } }));
  assert.ok(nulls.display.score <= first.display.score);
  assert.equal(nulls.debug.day.steps, 9000);
  // primeira leitura do ciclo sem passos nem calorias: estimado, e nenhum valor anterior para comparar
  const firstEmpty = runVitalityEngine(input({ day: { steps: null, activeKcal: null, workouts: [] } }));
  assert.deepEqual(firstEmpty.debug.cycle.estimatedReasons, ['sem_movimento']);
  assert.equal(firstEmpty.estimated, true);
});

test('totais do ciclo so crescem: leitura menor ou atrasada nao recupera a Vitalidade', () => {
  const first = runVitalityEngine(input({ day: day({ steps: 9000, activeKcal: 450 }) }));
  const lagging = runVitalityEngine(input({ stored: first.next, day: day({ steps: 4000, activeKcal: 200 }) }));
  assert.equal(lagging.debug.day.steps, 9000);
  assert.ok(lagging.display.score <= first.display.score);
});

// ------------------------------------------------------------------------------------------------------------------------- referencias
const emptyDays = (n) => Array.from({ length: n }, () => ({ steps: null, activeKcal: null, workouts: [] }));
const days = (n, over = {}) => Array.from({ length: n }, () => ({ steps: 5000, activeKcal: 250, workouts: [], ...over }));

test('referencias fixadas por ciclo: a segunda atualizacao usa as guardadas, mesmo com historico novo', () => {
  const first = runVitalityEngine(input({ history: HISTORY }));
  const second = runVitalityEngine(input({ stored: first.next, history: days(7, { steps: 12000, activeKcal: 900 }) }));
  assert.equal(second.debug.refs.steps, 5000);
  assert.equal(second.debug.refsFromStorage, true);
});

test('historico lido mas SEM dados (fallback): nao fixa as referencias e tenta de novo na proxima atualizacao', () => {
  const first = runVitalityEngine(input({ history: emptyDays(14) }));
  assert.equal(first.debug.refs.steps, 6000);
  assert.equal(first.next.refs, null);
  const second = runVitalityEngine(input({ stored: first.next, history: days(7) }));
  assert.equal(second.debug.refs.steps, 5000);
  assert.equal(second.next.refs.dayKey, second.debug.cycle.key);
  const third = runVitalityEngine(input({ stored: second.next, history: emptyDays(14) }));
  assert.equal(third.debug.refsFromStorage, true);
});

test('menos de 5 dias, so passos OU so calorias e so treino do historico', () => {
  assert.equal(runVitalityEngine(input({ history: days(4) })).next.refs, null);
  assert.equal(runVitalityEngine(input({ history: days(6, { activeKcal: null }) })).next.refs.dayKey, at(0, 6).toISOString());
  assert.equal(runVitalityEngine(input({ history: days(6, { steps: null }) })).next.refs.dayKey, at(0, 6).toISOString());
  assert.equal(runVitalityEngine(input({ history: days(6, { steps: null, activeKcal: null, workouts: [{ minutes: 60 }] }) })).next.refs, null);
});

test('a FC de repouso guardada acompanha as referencias do ciclo', () => {
  const first = runVitalityEngine(input({ restHr: 55, history: HISTORY }));
  const second = runVitalityEngine(input({ restHr: 70, stored: first.next }));
  assert.equal(second.debug.restHr, 55);
});

// ------------------------------------------------------------------------------------------------------------------------- dono do estado
test('estado guardado de OUTRO usuario e ignorado: base congelada, referencias e ultimo valor nao passam para a outra pessoa', () => {
  const a = runVitalityEngine(input({ userId: 'user-A', history: HISTORY }));
  assert.equal(a.next.userId, 'user-A');
  const b = runVitalityEngine(input({ userId: 'user-B', stored: a.next, sleep: sleepWake(at(0, 6), 40), readiness: readiness({ load_score_prior: 30, hr_score: 20 }) }));
  assert.notEqual(b.debug.base.used, a.debug.base.used);
  assert.equal(b.debug.refsFromStorage, false);
  assert.equal(b.next.userId, 'user-B');
});

test('estado do MESMO usuario continua valendo; estado antigo sem dono e aceito e carimbado', () => {
  const first = runVitalityEngine(input({ userId: 'user-A' }));
  const again = runVitalityEngine(input({ userId: 'user-A', stored: first.next, sleep: sleepWake(at(0, 6), 10) }));
  assert.equal(again.debug.base.used, first.debug.base.used);
  const legacy = runVitalityEngine(input({ userId: null })).next;
  const stamped = runVitalityEngine(input({ userId: 'user-A', stored: legacy }));
  assert.equal(stamped.next.userId, 'user-A');
});

test('storedStateForUser: bordas', () => {
  const s = { ...EMPTY_STORED_STATE, userId: 'A', frozenBase: { dayKey: 'x', base: 80 } };
  assert.equal(storedStateForUser(s, 'A'), s);
  assert.equal(storedStateForUser(s, 'B'), EMPTY_STORED_STATE);
  assert.equal(storedStateForUser(s, null), s);
  const legacy = { ...s, userId: null };
  assert.equal(storedStateForUser(legacy, 'B'), legacy);
  for (const bad of [null, undefined, {}, { v: 2 }]) assert.equal(storedStateForUser(bad, 'A'), EMPTY_STORED_STATE);
});

test('estado guardado do formato antigo (chaves por dia do calendario) nao e reaproveitado no ciclo novo', () => {
  const old = { ...EMPTY_STORED_STATE, frozenBase: { dayKey: '2026-11-17', base: 11 }, lastShown: { dayKey: '2026-11-17', score: 5 }, refs: null, day: { dayKey: '2026-11-17', value: day({ steps: 99999 }) } };
  const out = runVitalityEngine(input({ stored: old }));
  assert.notEqual(out.debug.base.used, 11);
  assert.notEqual(out.debug.day.steps, 99999);
});

test('estado invalido ou de outra versao e ignorado sem quebrar', () => {
  for (const stored of [undefined, null, {}, { v: 2 }, 'x']) {
    const out = runVitalityEngine(input({ stored }));
    assert.equal(out.next.v, 1);
    assert.ok(out.display.score != null);
  }
});

// -------------------------------------------------------------------------------------------------------------------------- estabilidade
test('um ciclo inteiro de atualizacoes cruzando a meia-noite: nunca sobe mais de 2 nem cai mais de 12 entre atualizacoes', () => {
  const wake = at(0, 12);
  let stored = null;
  let prev = null;
  for (let step = 0; step < 14 * 4; step += 1) {
    const now = new Date(wake.getTime() + step * 15 * 60000);
    const out = runVitalityEngine(input({ now, sleep: sleepWake(wake), stored, day: day({ steps: step * 45, activeKcal: step * 2 }) }));
    stored = out.next;
    if (prev != null) {
      assert.ok(out.display.score - prev <= 2, `subiu ${out.display.score - prev}`);
      assert.ok(prev - out.display.score <= 12, `caiu ${prev - out.display.score}`);
    }
    prev = out.display.score;
  }
});
