// Testes de utils/syncMarkers.ts (limpeza das chaves de sincronizacao no logout). Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTO_IMPORT_ANCHOR_KEY,
  AUTO_IMPORT_LAST_RUN_KEY,
  HEART_RATE_LAST_RUN_KEY,
  HEART_RATE_LAST_SYNC_KEY,
  clearSyncMarkersIn,
  getSyncMarkersGeneration,
  setMarkerIfCurrent,
} from '../utils/syncMarkers.ts';

const FOUR_KEYS = [AUTO_IMPORT_ANCHOR_KEY, AUTO_IMPORT_LAST_RUN_KEY, HEART_RATE_LAST_SYNC_KEY, HEART_RATE_LAST_RUN_KEY];

function memoryStore(initial = {}, failKeys = []) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      if (failKeys.includes(key)) throw new Error(`falha ao remover ${key}`);
      data.delete(key);
    },
  };
}

test('os nomes das 4 chaves sao os que o app ja usa no aparelho', () => {
  assert.deepEqual(FOUR_KEYS, [
    'workout_auto_import_anchor_v1',
    'workout_auto_import_last_run_v1',
    'heart_rate_last_synced_at',
    'heart_rate_last_sync_run_at',
  ]);
});

test('remove as 4 chaves e nao mexe nas outras', async () => {
  const asyncStore = memoryStore({
    [AUTO_IMPORT_ANCHOR_KEY]: 'a',
    [AUTO_IMPORT_LAST_RUN_KEY]: 'b',
    vitality_state_v1: 'v',
    workout_auto_import_enabled_v1: 'true',
    healthkit_connected: 'true',
  });
  const secureStore = memoryStore({
    [HEART_RATE_LAST_SYNC_KEY]: 'c',
    [HEART_RATE_LAST_RUN_KEY]: 'd',
    auth_token: 'segredo',
  });

  const removed = await clearSyncMarkersIn(asyncStore, secureStore);

  assert.deepEqual([...removed].sort(), [...FOUR_KEYS].sort());
  assert.deepEqual([...asyncStore.data.keys()].sort(), ['healthkit_connected', 'vitality_state_v1', 'workout_auto_import_enabled_v1']);
  assert.deepEqual([...secureStore.data.keys()], ['auth_token']);
});

test('falha de uma remocao nao lanca e as outras continuam', async () => {
  const asyncStore = memoryStore({ [AUTO_IMPORT_ANCHOR_KEY]: 'a', [AUTO_IMPORT_LAST_RUN_KEY]: 'b' }, [AUTO_IMPORT_ANCHOR_KEY]);
  const secureStore = memoryStore({ [HEART_RATE_LAST_SYNC_KEY]: 'c', [HEART_RATE_LAST_RUN_KEY]: 'd' }, [HEART_RATE_LAST_SYNC_KEY]);

  const removed = await clearSyncMarkersIn(asyncStore, secureStore);

  assert.deepEqual([...removed].sort(), [AUTO_IMPORT_LAST_RUN_KEY, HEART_RATE_LAST_RUN_KEY].sort());
  assert.ok(asyncStore.data.has(AUTO_IMPORT_ANCHOR_KEY)); // a que falhou continua la
  assert.ok(!asyncStore.data.has(AUTO_IMPORT_LAST_RUN_KEY));
  assert.ok(secureStore.data.has(HEART_RATE_LAST_SYNC_KEY));
  assert.ok(!secureStore.data.has(HEART_RATE_LAST_RUN_KEY));
});

test('sincronizacao iniciada antes da limpeza nao grava o marcador de volta', async () => {
  const store = memoryStore();
  const generation = getSyncMarkersGeneration(); // a sincronizacao comeca aqui

  assert.equal(await setMarkerIfCurrent(store, HEART_RATE_LAST_SYNC_KEY, 'antes', generation), true);
  assert.equal(store.data.get(HEART_RATE_LAST_SYNC_KEY), 'antes');

  await clearSyncMarkersIn(store, store); // logout no meio da execucao

  assert.equal(await setMarkerIfCurrent(store, HEART_RATE_LAST_SYNC_KEY, 'depois', generation), false);
  assert.equal(store.data.has(HEART_RATE_LAST_SYNC_KEY), false);
});

test('limpeza durante a propria gravacao desfaz o que acabou de gravar', async () => {
  const store = memoryStore();
  const generation = getSyncMarkersGeneration();
  const slowStore = {
    ...store,
    async setItem(key, value) {
      await store.setItem(key, value);
      await clearSyncMarkersIn(store, store); // logout acontece enquanto o setItem esta em voo
    },
    removeItem: (key) => store.removeItem(key),
  };

  assert.equal(await setMarkerIfCurrent(slowStore, AUTO_IMPORT_ANCHOR_KEY, 'x', generation), false);
  assert.equal(store.data.has(AUTO_IMPORT_ANCHOR_KEY), false);
});

test('depois de uma limpeza, uma sincronizacao nova (geracao atual) grava normalmente', async () => {
  const store = memoryStore();
  await clearSyncMarkersIn(store, store);
  const generation = getSyncMarkersGeneration();

  assert.equal(await setMarkerIfCurrent(store, HEART_RATE_LAST_RUN_KEY, 'ok', generation), true);
  assert.equal(store.data.get(HEART_RATE_LAST_RUN_KEY), 'ok');
});
