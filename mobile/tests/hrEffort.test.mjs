// Esforco por hora da FC em MODO SOMBRA (vitalityDynamic.ts: hourlyEffort, hrEffortWear, maxHrFromAge, HR_EFFORT_ENABLED) e diagnostico (vitalityDebugView.ts). Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_MAX_HR,
  HR_EFFORT,
  HR_EFFORT_ENABLED,
  K,
  dayWear,
  heartRateWear,
  hourlyEffort,
  hrEffortWear,
  maxHrFromAge,
  monotonicDay,
  vitalityNow,
  workoutUnits,
} from '../services/vitalityDynamic.ts';
import { formatHeartRateStats, formatHrEffortDebug, heartRateSampleStats } from '../services/vitalityDebugView.ts';

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) <= eps, `esperado ~${expected}, veio ${actual}`);
const H = 3600000;
const T0 = new Date(2026, 10, 17, 8, 0, 0).getTime();
const hour = (i, avgHr) => ({ startMs: T0 + i * H, avgHr });
const REFS = { steps: 6000, kcal: 300, eref: 60, fromHistory: { steps: true, kcal: true, eref: true } };
const baseDay = (over = {}) => ({ steps: 3000, activeKcal: 150, workouts: [], awakeHrElevation: 12, restHours: 1, napMinutes: 0, awakeMinutes: 300, ...over });

test('interruptor: o modo sombra vem DESLIGADO', () => {
  assert.equal(HR_EFFORT_ENABLED, false);
  assert.equal(K.hrMax, 6);
});

test('FC igual ao repouso (ou abaixo) = esforco 0', () => {
  const r = hourlyEffort([hour(0, 60), hour(1, 50)], 60, 190, {});
  assert.equal(r.total, 0);
  assert.deepEqual(r.hours.map((h) => [h.status, h.reserve, h.effort]), [['ok', 0, 0], ['ok', 0, 0]]);
});

test('TRIMP de Banister: reserva 0,5 por 60 min = 60 x 0,5 x 0,64 x e^(1,92 x 0,5)', () => {
  const r = hourlyEffort([hour(0, 125)], 60, 190, {}); // (125-60)/(190-60) = 0,5
  near(r.hours[0].reserve, 0.5);
  near(r.hours[0].effort, 60 * 0.5 * HR_EFFORT.weightA * Math.exp(HR_EFFORT.weightB * 0.5));
  near(r.total, r.hours[0].effort);
  // acima da FC maxima: reserva limitada a 1
  near(hourlyEffort([hour(0, 220)], 60, 190, {}).hours[0].reserve, 1);
});

test('hora de treino e hora de sono/soneca sao EXCLUIDAS', () => {
  const exclusions = { workouts: [{ startMs: T0 + 1 * H + 10 * 60000, endMs: T0 + 1 * H + 50 * 60000 }], sleep: [{ startMs: T0 + 2 * H, endMs: T0 + 2.5 * H }] };
  const r = hourlyEffort([hour(0, 120), hour(1, 160), hour(2, 150), hour(3, 120)], 60, 190, exclusions);
  assert.deepEqual(r.hours.map((h) => h.status), ['ok', 'treino', 'sono', 'ok']);
  assert.equal(r.excludedWorkout, 1);
  assert.equal(r.excludedSleep, 1);
  assert.equal(r.hours[1].effort, 0);
  assert.equal(r.hours[2].effort, 0);
  near(r.total, r.hours[0].effort + r.hours[3].effort);
  // treino que so comeca quando a hora acaba nao a exclui
  assert.equal(hourlyEffort([hour(0, 120)], 60, 190, { workouts: [{ startMs: T0 + H, endMs: T0 + 2 * H }] }).hours[0].status, 'ok');
});

test('hora sem amostra = 0, sem repouso = 0, FC maxima menor que o repouso = 0 (dado ausente nunca soma)', () => {
  const r = hourlyEffort([hour(0, null), hour(1, 120)], 60, 190, {});
  assert.equal(r.hours[0].status, 'sem_dado');
  assert.equal(r.hours[0].effort, 0);
  assert.equal(r.noData, 1);
  assert.equal(hourlyEffort([hour(0, 150)], null, 190, {}).total, 0);
  assert.equal(hourlyEffort([hour(0, 150)], 60, 50, {}).total, 0);
  assert.equal(hourlyEffort([], 60, 190, {}).total, 0);
  // FC maxima ausente usa o padrao 190
  near(hourlyEffort([hour(0, 125)], 60, null, {}).total, hourlyEffort([hour(0, 125)], 60, DEFAULT_MAX_HR, {}).total);
  // acrescentar uma hora sem amostra nunca aumenta o total
  assert.equal(hourlyEffort([hour(0, 120), hour(1, null)], 60, 190, {}).total, hourlyEffort([hour(0, 120)], 60, 190, {}).total);
});

test('teto: o desgaste de FC por esforco nunca passa de K.hrMax (6)', () => {
  const many = Array.from({ length: 16 }, (_, i) => hour(i, 185));
  const r = hourlyEffort(many, 60, 190, {});
  assert.ok(r.total > HR_EFFORT.fullUnits * 10);
  assert.equal(hrEffortWear(r.total), K.hrMax);
  assert.equal(hrEffortWear(HR_EFFORT.fullUnits), K.hrMax);
  near(hrEffortWear(HR_EFFORT.fullUnits / 2), K.hrMax / 2);
  for (const v of [null, undefined, NaN, 0, -5]) assert.equal(hrEffortWear(v), 0);
});

test('REGRESSAO: com HR_EFFORT_ENABLED = false a Vitalidade e identica ao de antes, mesmo com esforco novo gigante', () => {
  const effort = hourlyEffort(Array.from({ length: 12 }, (_, i) => hour(i, 180)), 60, 190, {});
  const a = vitalityNow(80, baseDay(), REFS, 60, 190);
  const b = vitalityNow(80, baseDay({ hrEffort: effort }), REFS, 60, 190);
  assert.equal(b.score, a.score);
  assert.equal(b.wear.total, a.wear.total);
  assert.equal(b.wear.heartRate, heartRateWear(12)); // o desgaste de antes: elevacao media de 12 bpm
  assert.equal(b.wear.heartRateCurrent, heartRateWear(12));
  assert.ok(b.wear.heartRateShadow > 0);
  assert.equal(b.recovery, a.recovery);
});

test('com o interruptor ligado (so em teste) o desgaste de FC usa o esforco novo, com o mesmo teto; sem esforco cai no de antes', () => {
  const effort = hourlyEffort(Array.from({ length: 12 }, (_, i) => hour(i, 180)), 60, 190, {});
  const on = dayWear(baseDay({ hrEffort: effort }), REFS, 60, 190, { hrEffortEnabled: true });
  assert.equal(on.heartRate, K.hrMax);
  assert.equal(on.heartRateCurrent, heartRateWear(12));
  const noEffort = dayWear(baseDay(), REFS, 60, 190, { hrEffortEnabled: true });
  assert.equal(noEffort.heartRate, heartRateWear(12));
  const off = dayWear(baseDay({ hrEffort: effort }), REFS, 60, 190, { hrEffortEnabled: false });
  assert.equal(off.heartRate, heartRateWear(12));
  // ligado, o esforco alto gasta mais que o de antes, mas o desgaste total continua limitado ao teto diario
  assert.ok(on.total <= K.maxDrop);
});

test('o esforco do ciclo so cresce entre atualizacoes (leitura que falha nao o zera)', () => {
  const big = hourlyEffort([hour(0, 150)], 60, 190, {});
  const small = hourlyEffort([hour(0, 90)], 60, 190, {});
  assert.equal(monotonicDay(baseDay({ hrEffort: big }), baseDay({ hrEffort: small })).hrEffort.total, big.total);
  assert.equal(monotonicDay(baseDay({ hrEffort: big }), baseDay({ hrEffort: null })).hrEffort.total, big.total);
  assert.equal(monotonicDay(baseDay({ hrEffort: small }), baseDay({ hrEffort: big })).hrEffort.total, big.total);
});

test('maxHrFromAge: Tanaka com data de nascimento; padrao 190 sem ela ou invalida', () => {
  const now = new Date(2026, 10, 17);
  assert.equal(maxHrFromAge('1990-06-15', now), Math.round(208 - 0.7 * 36)); // 36 anos = 183
  assert.equal(maxHrFromAge('1990-12-01', now), Math.round(208 - 0.7 * 35)); // ainda nao fez aniversario = 35 anos
  assert.equal(maxHrFromAge('1990-11-17', now), Math.round(208 - 0.7 * 36)); // aniversario hoje
  assert.equal(maxHrFromAge('1990-06-15T00:00:00', now), 183);
  for (const bad of [null, undefined, '', 'lixo', '1990-13-01', '2030-01-01', '2024-01-01', '1900-01-01']) assert.equal(maxHrFromAge(bad, now), DEFAULT_MAX_HR, String(bad));
});

test('treinos continuam com 190 (a FC maxima por idade so vale no esforco novo)', () => {
  assert.equal(workoutUnits({ minutes: 60, avgHr: 125 }, 60), workoutUnits({ minutes: 60, avgHr: 125 }, 60, DEFAULT_MAX_HR));
});

// ------------------------------------------------------------------------------------------------------------------------------- diagnostico
test('diagnostico: secao do esforco por hora lista horas, exclusoes e desgaste atual x sombra', () => {
  const effort = hourlyEffort([hour(0, 120), hour(1, 160), hour(2, null)], 60, 190, { workouts: [{ startMs: T0 + H, endMs: T0 + 2 * H }] });
  const day = baseDay({ hrEffort: effort });
  const wear = dayWear(day, REFS, 60, 190);
  const [section] = formatHrEffortDebug({ day, result: { wear } });
  assert.equal(section.title, 'FC: esforço por hora (sombra)');
  const v = Object.fromEntries(section.rows.map((r) => [r.label, r.value]));
  assert.match(v.Modo, /desligado/);
  assert.equal(v['Horas excluídas (treino / sono)'], '1 / 0');
  assert.equal(v['Horas sem amostra'], '1');
  assert.equal(v['Desgaste de FC atual (elevação média)'], wear.heartRateCurrent.toFixed(1));
  assert.equal(v['Desgaste de FC sombra (esforço)'], wear.heartRateShadow.toFixed(1));
  const rows = section.rows.map((r) => r.value).join('\n');
  assert.match(rows, /excluída \(treino\)/);
  assert.match(rows, /sem amostra \(conta 0\)/);
  assert.match(rows, /FC 120 · reserva 0\.46/);
  // sem dados: tracos, sem quebrar
  const empty = formatHrEffortDebug({ day: null, result: null })[0];
  assert.equal(empty.rows.find((r) => r.label === 'Esforço do dia (soma das horas)').value, '—');
});

test('diagnostico: botao Ler FC de hoje mostra contagem, mediana/p10/p90, maior lacuna e fonte', () => {
  const s = (sec, name = 'Garmin Connect', id = 'com.garmin.connect.mobile') => ({ startMs: T0 + sec * 1000, endMs: T0 + sec * 1000, bpm: 70, sourceName: name, sourceId: id });
  const samples = [s(0), s(10), s(20), s(30), s(40), s(340, 'iPhone', 'com.apple.health')];
  const st = heartRateSampleStats(samples);
  assert.equal(st.count, 6);
  assert.equal(st.medianSec, 10);
  assert.equal(st.maxGapSec, 300);
  assert.equal(st.p10Sec, 10);
  assert.ok(st.p90Sec > 10 && st.p90Sec <= 300);
  assert.deepEqual(st.sources.map((x) => [x.name, x.id, x.count]), [['Garmin Connect', 'com.garmin.connect.mobile', 5], ['iPhone', 'com.apple.health', 1]]);
  const text = formatHeartRateStats(samples).rows.map((r) => `${r.label}: ${r.value}`).join('\n');
  assert.match(text, /Amostras desde 00:00: 6/);
  assert.match(text, /Garmin Connect \(com\.garmin\.connect\.mobile\) · 5/);
  assert.equal(formatHeartRateStats([]).rows[0].value, 'nenhuma desde 00:00');
  assert.equal(heartRateSampleStats([]).medianSec, null);
});
