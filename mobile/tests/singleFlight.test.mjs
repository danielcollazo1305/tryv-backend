// Testes de utils/singleFlight.ts. Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { singleFlight } from '../utils/singleFlight.ts';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test('duas chamadas enquanto a primeira esta em andamento executam UMA vez e devolvem a mesma promessa', async () => {
  let calls = 0;
  const gate = deferred();
  const run = singleFlight(async () => {
    calls += 1;
    return gate.promise;
  });
  const a = run();
  const b = run();
  const c = run();
  assert.strictEqual(a, b);
  assert.strictEqual(b, c);
  assert.equal(calls, 1);
  gate.resolve('ok');
  assert.equal(await a, 'ok');
  assert.equal(await b, 'ok');
  assert.equal(calls, 1);
});

test('depois que termina, a proxima chamada executa de novo', async () => {
  let calls = 0;
  const run = singleFlight(async () => ++calls);
  assert.equal(await run(), 1);
  assert.equal(await run(), 2);
  assert.equal(await run(), 3);
});

test('erro libera a trava: a proxima chamada tenta de novo, e todos os que esperavam recebem o mesmo erro', async () => {
  let calls = 0;
  const gate = deferred();
  const run = singleFlight(async () => {
    calls += 1;
    if (calls === 1) return gate.promise;
    return 'recuperou';
  });
  const first = run();
  const second = run();
  gate.reject(new Error('falhou'));
  await assert.rejects(first, /falhou/);
  await assert.rejects(second, /falhou/);
  assert.equal(await run(), 'recuperou');
  assert.equal(calls, 2);
});

test('funcao que lanca de forma sincrona tambem libera a trava', async () => {
  let calls = 0;
  const run = singleFlight(() => {
    calls += 1;
    if (calls === 1) throw new Error('sincrono');
    return Promise.resolve('ok');
  });
  await assert.rejects(run(), /sincrono/);
  assert.equal(await run(), 'ok');
});

test('instancias diferentes nao se travam entre si', async () => {
  const gate = deferred();
  const slow = singleFlight(() => gate.promise);
  const fast = singleFlight(async () => 'rapida');
  const pending = slow();
  assert.equal(await fast(), 'rapida');
  gate.resolve('lenta');
  assert.equal(await pending, 'lenta');
});
