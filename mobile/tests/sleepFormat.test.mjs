// Testes do titulo da noite na tela de Sono (utils/sleepFormat.ts): a data e a de ACORDAR, nao a de hoje. Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatNightLabel, formatSleepMinutes } from '../utils/sleepFormat.ts';

test('a noite 02:20-11:54 de segunda 16/11 se chama "seg, 16 de nov." mesmo vendo a tela na terca 17/11', () => {
  const wakeAt = new Date(2026, 10, 16, 11, 54).toISOString();
  const tuesday = new Date(2026, 10, 17, 0, 5);
  assert.equal(formatNightLabel(wakeAt, tuesday), 'Noite de seg, 16 de nov.');
  assert.notEqual(formatNightLabel(wakeAt, tuesday), formatNightLabel(null, tuesday)); // sem a noite, usa o dia de hoje
});

test('a data e a de acordar (fim da noite), tambem quando a noite atravessa a meia-noite', () => {
  assert.equal(formatNightLabel(new Date(2026, 10, 17, 6, 30).toISOString(), new Date(2026, 10, 20)), 'Noite de ter, 17 de nov.');
  assert.equal(formatNightLabel(new Date(2026, 10, 1, 0, 10).toISOString(), new Date(2026, 10, 20)), 'Noite de dom, 01 de nov.');
});

test('sem horario de acordar valido usa a data de fallback (hoje)', () => {
  const today = new Date(2026, 10, 17, 10, 0);
  for (const bad of [null, undefined, '', 'nao e data']) assert.equal(formatNightLabel(bad, today), 'Noite de ter, 17 de nov.');
});

test('duracao de sono continua igual (9h 08m = 548 min)', () => {
  assert.equal(formatSleepMinutes(548), '9h 08m');
});
