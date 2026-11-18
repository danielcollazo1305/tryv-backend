// Regra de "voltou ao primeiro plano" (utils/appActive.ts) usada por hooks/useOnAppActive.ts. Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SLEEP_REREAD_MIN_INTERVAL_MS, shouldRunOnActive } from '../utils/appActive.ts';

test('so roda na transicao para active', () => {
  assert.equal(shouldRunOnActive('background', 'active', 0, 100000, 0), true);
  assert.equal(shouldRunOnActive('inactive', 'active', 0, 100000, 0), true);
  assert.equal(shouldRunOnActive('active', 'active', 0, 100000, 0), false);
  assert.equal(shouldRunOnActive('active', 'background', 0, 100000, 0), false);
  assert.equal(shouldRunOnActive('background', 'inactive', 0, 100000, 0), false);
});

test('pausa curta da releitura do sono: dentro da pausa nao roda, passada a pausa roda', () => {
  assert.equal(SLEEP_REREAD_MIN_INTERVAL_MS, 10000);
  assert.equal(shouldRunOnActive('background', 'active', 50000, 50000 + 9999, SLEEP_REREAD_MIN_INTERVAL_MS), false);
  assert.equal(shouldRunOnActive('background', 'active', 50000, 50000 + 10000, SLEEP_REREAD_MIN_INTERVAL_MS), true);
});

test('relogio andando para tras nao trava a releitura', () => {
  assert.equal(shouldRunOnActive('background', 'active', 90000, 10000, SLEEP_REREAD_MIN_INTERVAL_MS), true);
});
