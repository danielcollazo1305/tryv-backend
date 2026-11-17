// Testes dos textos compartilhados da Vitalidade (services/vitalityView.ts). Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  VITALITY_DISCLAIMER,
  VITALITY_PROVISIONAL_NOTE,
  formatUpdatedAt,
  vitalityAccessibilityLabel,
  vitalityHeadline,
  vitalityRecommendation,
} from '../services/vitalityView.ts';

test('aviso de estimativa de bem-estar, nao medida medica', () => {
  assert.match(VITALITY_DISCLAIMER, /estimativa de bem-estar/i);
  assert.match(VITALITY_DISCLAIMER, /não uma medida médica/);
  assert.match(VITALITY_PROVISIONAL_NOTE, /acordar/);
});

test('numero + rotulo com os rotulos de sempre', () => {
  assert.equal(vitalityHeadline('fit', 84.4), 'Em forma · 84');
  assert.equal(vitalityHeadline('attention', 64.6), 'Atenção · 65');
  assert.equal(vitalityHeadline('recover', 12), 'Recuperar · 12');
  assert.equal(vitalityHeadline('nodata', null), 'Sem dados');
  assert.equal(vitalityHeadline('fit', null), 'Sem dados');
  assert.equal(vitalityHeadline('fit', NaN), 'Sem dados');
});

test('orientacao por estado; sem dados fica vazia', () => {
  assert.match(vitalityRecommendation('fit'), /treinar/);
  assert.match(vitalityRecommendation('attention'), /mais leve/);
  assert.match(vitalityRecommendation('recover'), /descanso/);
  assert.equal(vitalityRecommendation('nodata'), '');
});

test('rotulo de acessibilidade: estado, pontuacao, componentes, provisorio e o aviso', () => {
  const label = vitalityAccessibilityLabel('fit', 84.2, { sleep: 90, load: 100, hr: null }, false);
  assert.match(label, /Vitalidade: Em forma\./);
  assert.match(label, /Pontuação 84 de 100\./);
  assert.match(label, /Sono 90 de 100\./);
  assert.match(label, /Carga 100 de 100\./);
  assert.match(label, /Frequência cardíaca sem dado\./);
  assert.ok(label.endsWith(VITALITY_DISCLAIMER));
  assert.ok(!label.includes('provisório'));
  assert.match(vitalityAccessibilityLabel('attention', 50, null, true), /provisório/);
  assert.match(vitalityAccessibilityLabel('nodata', null, null), /sem dados/);
  assert.match(vitalityAccessibilityLabel('fit', NaN, null), /sem dados/);
});

test('"Atualizado as HH:mm" em horario local com zero a esquerda', () => {
  assert.equal(formatUpdatedAt(new Date(2026, 10, 17, 9, 5).getTime()), 'Atualizado às 09:05');
  assert.equal(formatUpdatedAt(new Date(2026, 10, 17, 23, 59).getTime()), 'Atualizado às 23:59');
  assert.equal(formatUpdatedAt(new Date(2026, 10, 17, 0, 0).getTime()), 'Atualizado às 00:00');
  for (const bad of [null, undefined, NaN, Infinity]) assert.equal(formatUpdatedAt(bad), '');
});
