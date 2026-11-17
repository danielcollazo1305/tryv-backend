// Testes da juncao de treinos duplicados (services/workoutWindows.ts). Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WORKOUT_DUPLICATE_OVERLAP, mergeOverlappingWorkouts, overlapFraction } from '../services/workoutWindows.ts';

const MIN = 60000;
const w = (id, startMin, endMin) => ({ id, start: startMin * MIN, end: endMin * MIN });
const range = (x) => ({ start: x.start, end: x.end });
const ids = (list) => list.map((x) => x.id);
const merge = (list) => mergeOverlappingWorkouts(list, range);

test('constante: 80%', () => assert.equal(WORKOUT_DUPLICATE_OVERLAP, 0.8));

test('fracao de sobreposicao e relativa a janela MAIS CURTA', () => {
  assert.equal(overlapFraction(w('a', 0, 100), w('b', 0, 100)), 1);
  assert.equal(overlapFraction(w('a', 0, 100), w('b', 20, 60)), 1); // a curta esta toda dentro da longa
  assert.equal(overlapFraction(w('a', 0, 100), w('b', 50, 150)), 0.5);
  assert.equal(overlapFraction(w('a', 0, 60), w('b', 60, 120)), 0); // encostam, nao se sobrepoem
  assert.equal(overlapFraction(w('a', 0, 60), w('b', 100, 160)), 0);
  assert.equal(overlapFraction(w('a', 10, 10), w('b', 0, 100)), 0); // janela vazia
  assert.equal(overlapFraction(w('a', 50, 10), w('b', 0, 100)), 0); // janela invertida
});

test('sem sobreposicao: mantem todos, em ordem de inicio', () => {
  assert.deepEqual(ids(merge([w('b', 100, 160), w('a', 0, 60)])), ['a', 'b']);
});

test('79% de sobreposicao: sao treinos diferentes (mantem os dois)', () => {
  // a = 0..100 (100 min), b = 21..121 (100 min): intersecao 79 min = 79%
  assert.deepEqual(ids(merge([w('a', 0, 100), w('b', 21, 121)])), ['a', 'b']);
});

test('80% de sobreposicao: duplicata (fica um so)', () => {
  // intersecao 80 min de 100 = 80%
  assert.equal(merge([w('a', 0, 100), w('b', 20, 120)]).length, 1);
});

test('100% de sobreposicao: fica o de MAIOR duracao', () => {
  assert.deepEqual(ids(merge([w('curto', 10, 50), w('longo', 0, 60)])), ['longo']); // curto 100% dentro do longo
  assert.deepEqual(ids(merge([w('longo', 0, 60), w('curto', 10, 50)])), ['longo']); // ordem de entrada nao importa
});

test('mesma janela e duracao: fica o primeiro da lista, sem perder nenhum treino distinto', () => {
  assert.deepEqual(ids(merge([w('x', 0, 60), w('y', 0, 60)])), ['x']);
});

test('tres janelas: o mesmo treino gravado tres vezes vira um', () => {
  assert.deepEqual(ids(merge([w('a', 0, 60), w('b', 1, 61), w('c', 0, 58)])), ['a']);
});

test('tres janelas em cadeia: so descarta o que duplica um MANTIDO', () => {
  // a 0..100 e b 60..160: sobreposicao 40% (diferentes). c 61..160 duplica b (99/99 = 100%) e nao duplica a.
  const out = merge([w('a', 0, 100), w('b', 60, 160), w('c', 61, 160)]);
  assert.deepEqual(ids(out), ['a', 'b']);
});

test('tres treinos distintos no mesmo dia continuam os tres', () => {
  assert.deepEqual(ids(merge([w('manha', 7 * 60, 8 * 60), w('almoco', 12 * 60, 12 * 60 + 30), w('noite', 19 * 60, 20 * 60)])), ['manha', 'almoco', 'noite']);
});

test('um treino curto dentro de um longo NAO distinto (ex.: aquecimento gravado a parte) e tratado como duplicata', () => {
  assert.deepEqual(ids(merge([w('longo', 0, 90), w('aquecimento', 0, 20)])), ['longo']);
});

test('limiar configuravel e entradas invalidas', () => {
  assert.equal(mergeOverlappingWorkouts([w('a', 0, 100), w('b', 50, 150)], range, 0.5).length, 1); // 50% com limiar 50%
  assert.equal(mergeOverlappingWorkouts([w('a', 0, 100), w('b', 50, 150)], range, 0.51).length, 2);
  assert.deepEqual(merge([]), []);
  assert.deepEqual(merge(null), []);
  assert.deepEqual(ids(merge([w('ruim', 50, 10), w('nan', NaN, 5), w('ok', 0, 30)])), ['ok']);
});

test('nao altera a lista de entrada', () => {
  const input = [w('b', 100, 160), w('a', 0, 60), w('c', 5, 55)];
  const snapshot = JSON.stringify(input);
  merge(input);
  assert.equal(JSON.stringify(input), snapshot);
});
