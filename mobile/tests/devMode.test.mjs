// Testes do modo desenvolvedor: contagem de toques (services/devTaps.ts) e formatacao da depuracao (services/vitalityDebugView.ts). Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEV_TAPS_NEEDED, DEV_TAP_WINDOW_MS, nextTap } from '../services/devTaps.ts';
import { formatVitalityDebug } from '../services/vitalityDebugView.ts';
import { runVitalityEngine } from '../services/vitalityEngine.ts';

test('7 toques seguidos ativam; antes do 7o nada acontece', () => {
  assert.equal(DEV_TAPS_NEEDED, 7);
  let state = null;
  for (let i = 1; i <= 6; i += 1) {
    const r = nextTap(state, 1000 + i * 300);
    assert.equal(r.triggered, false, `toque ${i}`);
    assert.equal(r.state.count, i);
    state = r.state;
  }
  const seventh = nextTap(state, 1000 + 7 * 300);
  assert.equal(seventh.triggered, true);
  assert.equal(seventh.state.count, 0); // zera depois de ativar
});

test('uma pausa maior que 2 s recomeca a contagem', () => {
  assert.equal(DEV_TAP_WINDOW_MS, 2000);
  let state = nextTap(null, 0).state;
  state = nextTap(state, 500).state;
  state = nextTap(state, 1000).state;
  const late = nextTap(state, 1000 + DEV_TAP_WINDOW_MS + 1);
  assert.equal(late.state.count, 1);
  assert.equal(late.triggered, false);
  const onTime = nextTap(state, 1000 + DEV_TAP_WINDOW_MS);
  assert.equal(onTime.state.count, 4); // exatamente na borda ainda conta
});

test('seis toques e pausa, de novo seis: nunca ativa', () => {
  let state = null;
  let t = 0;
  for (let round = 0; round < 3; round += 1) {
    for (let i = 0; i < 6; i += 1) {
      const r = nextTap(state, (t += 400));
      assert.equal(r.triggered, false);
      state = r.state;
    }
    t += 5000;
  }
});

test('relogio andando para tras ou estado invalido recomeca', () => {
  assert.equal(nextTap({ count: 5, last: 10_000 }, 5_000).state.count, 1);
  assert.equal(nextTap(undefined, 100).state.count, 1);
  assert.equal(nextTap({ count: 0, last: 0 }, 100).state.count, 1);
});

test('toque unico configuravel', () => {
  assert.equal(nextTap(null, 0, 1).triggered, true);
  assert.equal(nextTap({ count: 2, last: 0 }, 100, 3).triggered, true);
});

// ------------------------------------------------------------------------------------------------ formatacao da depuracao
const NOW = new Date(2026, 10, 17, 15, 30);
const debugFor = (over = {}) =>
  runVitalityEngine({
    now: NOW, todayKey: '2026-11-17', yesterdayKey: '2026-11-16',
    sleep: { quality: 88, confidence: 1, parts: { duration: 95.4, debt: 100 }, isToday: true },
    readiness: { load_score: 80, load_score_prior: 100, hr_score: 90 },
    day: { steps: 8000, activeKcal: 400, workouts: [{ minutes: 40, avgHr: 150, steps: 3000, activeKcal: 300 }], awakeHrElevation: 9, restHours: 3, napMinutes: 20 },
    history: Array.from({ length: 7 }, () => ({ steps: 5000, activeKcal: 250, workouts: [] })), restHr: 58, stored: null, ...over,
  }).debug;

const flat = (sections) => Object.fromEntries(sections.flatMap((s) => s.rows.map((r) => [r.label, r.value])));

test('depuracao mostra base e componentes, desgastes, recuperacao, resultado, referencias, congelamento e hora', () => {
  const sections = formatVitalityDebug(debugFor());
  assert.deepEqual(sections.map((s) => s.title), ['Base da manhã', 'Desgaste do dia', 'Resultado', 'Referências pessoais (14 dias)', 'Hoje (ao vivo)', 'Atualização']);
  const v = flat(sections);
  assert.equal(v['Congelada hoje'], 'sim');
  assert.equal(v['Qualidade do sono (0,65)'], '88');
  assert.match(v['Componentes do sono'], /duração 95/);
  assert.equal(v['Carga 7 dias anteriores (0,20)'], '100');
  assert.equal(v['Carga com hoje (só backend)'], '80');
  assert.equal(v['FC do backend (0,15)'], '90');
  assert.match(v['Movimento (fora de treino)'], /^\d+\.\d \(razão /);
  assert.match(v['Treino'], /unidades/);
  assert.ok(Number.isFinite(Number(v['Desgaste total (máx. 55)'])));
  assert.ok(Number.isFinite(Number(v['Recuperação'])));
  assert.equal(v['Passos típicos (fora de treino)'], '5000');
  assert.equal(v['FC de repouso'], '58');
  assert.equal(v['Passos'], '8000');
  assert.equal(v['Treinos'], '1');
  assert.equal(v['Última atualização'], 'Atualizado às 15:30');
  assert.equal(v['Dia'], '2026-11-17');
  assert.match(v['Rótulo'], /Em forma|Atenção|Recuperar/);
});

test('depuracao marca referencias padrao e valores ausentes com tracos, sem lancar', () => {
  const v = flat(formatVitalityDebug(debugFor({ history: null, day: null, sleep: null, readiness: null, restHr: null })));
  assert.match(v['Passos típicos (fora de treino)'], /\(padrão\)/);
  assert.equal(v['FC de repouso'], '—');
  assert.equal(v['Passos'], '—');
  assert.equal(v['Treinos'], '0');
  assert.equal(v['Valor mostrado'], '—');
  assert.equal(v['Movimento (fora de treino)'], '—');
});

test('depuracao antes de acordar: provisoria, noite de ontem e sem desgaste calculado', () => {
  const v = flat(formatVitalityDebug(debugFor({ now: new Date(2026, 10, 17, 6, 0), sleep: { quality: 70, confidence: 0.8, parts: {}, isToday: false } })));
  assert.equal(v['Provisória (antes de acordar)'], 'sim');
  assert.match(v['Qualidade do sono (0,65)'], /\(noite de ontem\)/);
  assert.equal(v['Congelada hoje'], 'não');
  assert.equal(v['Desgaste total (máx. 55)'], '—');
});
