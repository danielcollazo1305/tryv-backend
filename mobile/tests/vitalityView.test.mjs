// Testes dos textos compartilhados da Vitalidade (services/vitalityView.ts) e da consistencia widget/app. Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runVitalityEngine } from '../services/vitalityEngine.ts';
import {
  VITALITY_DISCLAIMER,
  VITALITY_ESTIMATED_NOTE,
  VITALITY_ESTIMATED_NOTE_NO_MOVEMENT,
  VITALITY_ESTIMATED_NOTE_NO_SLEEP,
  formatUpdatedAt,
  vitalityAccessibilityLabel,
  vitalityEstimatedNote,
  vitalityHeadline,
  vitalityRecommendation,
  widgetVitalityFields,
} from '../services/vitalityView.ts';

test('aviso de estimativa de bem-estar, nao medida medica', () => {
  assert.match(VITALITY_DISCLAIMER, /estimativa de bem-estar/i);
  assert.match(VITALITY_DISCLAIMER, /não uma medida médica/);
});

test('avisos de valor estimado por motivo (sem sono tem prioridade); sem motivo = sem aviso', () => {
  assert.match(VITALITY_ESTIMATED_NOTE_NO_SLEEP, /sem dados de sono/);
  assert.match(VITALITY_ESTIMATED_NOTE_NO_MOVEMENT, /passos/);
  assert.equal(vitalityEstimatedNote(['sem_sono']), VITALITY_ESTIMATED_NOTE_NO_SLEEP);
  assert.equal(vitalityEstimatedNote(['sem_movimento', 'sem_sono']), VITALITY_ESTIMATED_NOTE_NO_SLEEP);
  assert.equal(vitalityEstimatedNote(['sem_movimento']), VITALITY_ESTIMATED_NOTE_NO_MOVEMENT);
  assert.equal(vitalityEstimatedNote(['outro']), VITALITY_ESTIMATED_NOTE);
  for (const none of [[], null, undefined]) assert.equal(vitalityEstimatedNote(none), '');
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

test('rotulo de acessibilidade: estado, pontuacao, componentes, estimado e o aviso', () => {
  const label = vitalityAccessibilityLabel('fit', 84.2, { sleep: 90, load: 100, hr: null }, false);
  assert.match(label, /Vitalidade: Em forma\./);
  assert.match(label, /Pontuação 84 de 100\./);
  assert.match(label, /Sono 90 de 100\./);
  assert.match(label, /Carga 100 de 100\./);
  assert.match(label, /Frequência cardíaca sem dado\./);
  assert.ok(label.endsWith(VITALITY_DISCLAIMER));
  assert.ok(!label.includes('estimado'));
  assert.match(vitalityAccessibilityLabel('attention', 50, null, true), /estimado/);
  assert.match(vitalityAccessibilityLabel('nodata', null, null), /sem dados/);
  assert.match(vitalityAccessibilityLabel('fit', NaN, null), /sem dados/);
});

test('"Atualizado as HH:mm" em horario local com zero a esquerda', () => {
  assert.equal(formatUpdatedAt(new Date(2026, 10, 17, 9, 5).getTime()), 'Atualizado às 09:05');
  assert.equal(formatUpdatedAt(new Date(2026, 10, 17, 23, 59).getTime()), 'Atualizado às 23:59');
  assert.equal(formatUpdatedAt(new Date(2026, 10, 17, 0, 0).getTime()), 'Atualizado às 00:00');
  for (const bad of [null, undefined, NaN, Infinity]) assert.equal(formatUpdatedAt(bad), '');
});

// ----------------------------------------------------------------------------------------------------------------- consistencia widget / app
test('o widget recebe o MESMO rotulo e numero que o app mostra (widgetVitalityFields = vitalityHeadline)', () => {
  for (const [state, score] of [['fit', 84.4], ['attention', 64.6], ['recover', 12.2], ['fit', 100], ['recover', 0]]) {
    const fields = widgetVitalityFields({ state, score });
    assert.equal(`${fields.vitalityLabel} · ${fields.vitalityScore}`, vitalityHeadline(state, score), `${state} ${score}`);
  }
});

test('o widget fica sem Vitalidade (nulls) exatamente quando o app mostra "Sem dados"', () => {
  for (const v of [null, undefined, { state: 'nodata', score: null }, { state: 'fit', score: null }, { state: 'fit', score: NaN }, { state: 'nodata', score: 80 }]) {
    assert.deepEqual(widgetVitalityFields(v), { vitalityLabel: null, vitalityScore: null });
    assert.equal(vitalityHeadline(v?.state ?? 'nodata', v?.score), 'Sem dados');
  }
});

test('uma unica saida do motor alimenta app e widget: mesmo valor, mesmo rotulo, inclusive com a virada da meia-noite', () => {
  const wake = new Date(2026, 10, 17, 12, 0);
  const run = (now, stored) =>
    runVitalityEngine({
      now, todayKey: `2026-11-${String(now.getDate()).padStart(2, '0')}`, stored,
      sleep: { quality: 90, confidence: 1, parts: {}, wakeAt: wake.toISOString(), asleepMin: 540 },
      readiness: { load_score_prior: 100, hr_score: 88 }, day: { steps: 1500, activeKcal: 70, workouts: [] },
      history: Array.from({ length: 7 }, () => ({ steps: 5000, activeKcal: 250, workouts: [] })), restHr: 60,
    });
  let stored = null;
  for (const now of [new Date(2026, 10, 17, 23, 55), new Date(2026, 10, 18, 0, 5)]) {
    const out = run(now, stored);
    stored = out.next;
    const app = vitalityHeadline(out.display.state, out.display.score);
    const widget = widgetVitalityFields({ state: out.display.state, score: out.display.score });
    assert.equal(`${widget.vitalityLabel} · ${widget.vitalityScore}`, app);
    assert.notEqual(out.display.score, null);
  }
});

import { sleepFreshness } from '../services/sleepNights.ts';
import { sleepFreshnessText } from '../services/vitalityView.ts';

test('rotulo de frescor do sono: fresco, velho com Garmin, velho com outra fonte, mais antigo que ontem e sem rotulo', () => {
  const at = (day, h, m = 0) => new Date(2026, 10, day, h, m, 0);
  const now = at(17, 10, 30);
  assert.equal(sleepFreshnessText(sleepFreshness(at(17, 7, 12).toISOString(), now)), 'Dados do Apple Saúde de hoje às 07:12');
  const old = sleepFreshness(at(16, 11, 54).toISOString(), now);
  assert.equal(sleepFreshnessText(old, 'Garmin Connect'), 'Último dado de sono: ontem às 11:54. Abra o Garmin Connect para sincronizar.');
  assert.equal(sleepFreshnessText(old, 'iPhone'), 'Último dado de sono: ontem às 11:54. Abra o app do seu relógio para sincronizar.');
  assert.equal(sleepFreshnessText(old, null), 'Último dado de sono: ontem às 11:54. Abra o app do seu relógio para sincronizar.');
  assert.equal(sleepFreshnessText(sleepFreshness(at(14, 8, 5).toISOString(), now), 'Garmin Connect'), 'Último dado de sono: em 14/11 às 08:05. Abra o Garmin Connect para sincronizar.');
  assert.equal(sleepFreshnessText(sleepFreshness(at(16, 11, 54).toISOString(), at(17, 9, 0))), ''); // cedo demais: sem rotulo
  assert.equal(sleepFreshnessText(sleepFreshness(null, now)), '');
});
