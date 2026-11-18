// Testes do modo desenvolvedor: contagem de toques (services/devTaps.ts) e formatacao da depuracao (services/vitalityDebugView.ts). Rodar: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEV_TAPS_NEEDED, DEV_TAP_WINDOW_MS, nextTap } from '../services/devTaps.ts';
import { formatHoursMinutes, formatInstant, formatVitalityDebug } from '../services/vitalityDebugView.ts';
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
const WAKE = new Date(2026, 10, 17, 6, 40);
const debugFor = (over = {}) =>
  runVitalityEngine({
    now: NOW, todayKey: '2026-11-17',
    sleep: { quality: 88, confidence: 1, parts: { duration: 95.4, debt: 100 }, wakeAt: WAKE.toISOString(), asleepMin: 550 },
    readiness: { load_score: 80, load_score_prior: 100, hr_score: 90 },
    day: { steps: 8000, activeKcal: 400, workouts: [{ minutes: 40, avgHr: 150, steps: 3000, activeKcal: 300 }], awakeHrElevation: 9, restHours: 3, napMinutes: 20 },
    history: Array.from({ length: 7 }, () => ({ steps: 5000, activeKcal: 250, workouts: [] })), restHr: 58, stored: null, ...over,
  }).debug;

const flat = (sections) => Object.fromEntries(sections.flatMap((s) => s.rows.map((r) => [r.label, r.value])));

test('depuracao mostra ciclo, base e componentes, desgastes (inclusive tempo), recuperacao, resultado, referencias e hora', () => {
  const sections = formatVitalityDebug(debugFor());
  assert.deepEqual(sections.map((s) => s.title), ['Ciclo (começa ao acordar)', 'Base da manhã', 'Desgaste do ciclo', 'Resultado', 'Referências pessoais (14 dias)', 'Desde a âncora (ao vivo)', 'FC: esforço por hora (sombra)', 'Atualização']);
  const v = flat(sections);
  assert.equal(v['Âncora (acordou em)'], '17/11 06:40');
  assert.equal(v['Origem da âncora'], 'noite lida agora');
  assert.equal(v['Tempo acordado contado'], '8h 20m'); // 8h50 desde 06:40 menos 30 min (20 min de soneca x 1,5)
  assert.equal(v['Valor estimado'], 'não');
  assert.equal(v['Congelada neste ciclo'], 'sim');
  assert.equal(v['Qualidade do sono (0,65)'], '88');
  assert.match(v['Componentes do sono'], /duração 95/);
  assert.equal(v['Carga 7 dias anteriores (0,20)'], '100');
  assert.equal(v['Carga com hoje (só backend)'], '80');
  assert.equal(v['FC do backend (0,15)'], '90');
  assert.ok(Number.isFinite(Number(v['Tempo acordado (2,5/h, máx. 40)'])));
  assert.match(v['Movimento (fora de treino)'], /^\d+\.\d \(razão /);
  assert.match(v['Treino'], /unidades/);
  assert.ok(Number.isFinite(Number(v['Desgaste total (máx. 55)'])));
  assert.equal(v['Passos típicos (fora de treino)'], '5000');
  assert.equal(v['FC de repouso'], '58');
  assert.equal(v['Passos'], '8000');
  assert.equal(v['Treinos'], '1');
  assert.equal(v['Última atualização'], 'Atualizado às 15:30');
  assert.equal(v['Dia do calendário'], '2026-11-17');
  assert.match(v['Rótulo'], /Em forma|Atenção|Recuperar/);
});

test('depuracao: sem sono e sem ancora aparece como estimado/sem sono, sem tempo acordado, e com valores ausentes em tracos', () => {
  const v = flat(formatVitalityDebug(debugFor({ sleep: null, history: null, day: null, restHr: null })));
  assert.equal(v['Âncora (acordou em)'], '—');
  assert.match(v['Origem da âncora'], /nenhuma/);
  assert.equal(v['Tempo acordado contado'], '—');
  assert.match(v['Valor estimado'], /^sim \(.*sem sono/);
  assert.match(v['Passos típicos (fora de treino)'], /\(padrão\)/);
  assert.equal(v['FC de repouso'], '—');
  assert.equal(v['Passos'], '—');
  assert.equal(v['Treinos'], '0');
  assert.equal(v['Tempo acordado (2,5/h, máx. 40)'], '0.0');
});

test('depuracao: valor travado para nao subir por falta de dado aparece', () => {
  const first = runVitalityEngine({
    now: NOW, todayKey: '2026-11-17', sleep: { quality: 88, confidence: 1, parts: {}, wakeAt: WAKE.toISOString() }, readiness: { load_score_prior: 100, hr_score: 90 },
    day: { steps: 9000, activeKcal: 420, workouts: [] }, history: null, restHr: 60, stored: null,
  });
  const later = new Date(NOW.getTime() + 26 * 3600000);
  const capped = runVitalityEngine({ now: later, todayKey: '2026-11-18', sleep: null, readiness: { load_score_prior: 100, hr_score: 90 }, day: { steps: 9000, activeKcal: 420, workouts: [] }, history: null, restHr: 60, stored: { ...first.next, updatedAt: later.getTime() - 3600000 } });
  const v = flat(formatVitalityDebug(capped.debug));
  assert.match(v['Travado para não subir por falta de dado'], /^sim \(≤ \d+\)$/);
});

test('formatadores: instante e horas/minutos', () => {
  assert.equal(formatInstant(new Date(2026, 10, 7, 9, 5).toISOString()), '07/11 09:05');
  for (const bad of [null, undefined, '', 'x']) assert.equal(formatInstant(bad), '—');
  assert.equal(formatHoursMinutes(548), '9h 08m');
  assert.equal(formatHoursMinutes(0), '0h 00m');
  for (const bad of [null, undefined, NaN, -1]) assert.equal(formatHoursMinutes(bad), '—');
});

import { describeSleepSessions } from '../services/sleepNights.ts';
import { formatSleepSessionsDebug } from '../services/vitalityDebugView.ts';
import { formatPartialSleepNote, SLEEP_WAITING_TITLE } from '../utils/sleepFormat.ts';

test('depuracao: sessoes de sono lidas listam inicio, fim, fonte, valores e a classificacao', () => {
  const s = (a, b, value, id = 'Garmin Connect') => ({ startDate: a, endDate: b, value, sourceId: id, sourceName: id });
  const samples = [
    s(new Date(2026, 10, 15, 23, 0), new Date(2026, 10, 16, 6, 30), 3),
    s(new Date(2026, 10, 16, 14, 0), new Date(2026, 10, 16, 14, 30), 1),
    s(new Date(2026, 10, 17, 2, 0), new Date(2026, 10, 17, 4, 2), 1, 'iPhone'),
  ];
  const section = formatSleepSessionsDebug(describeSleepSessions(samples));
  assert.equal(section.title, 'Sessões de sono lidas');
  assert.equal(section.rows.length, 3);
  const text = section.rows.map((r) => `${r.label} ${r.value}`).join('\n');
  assert.match(text, /soneca/);
  assert.match(text, /trecho parcial/);
  assert.match(text, /noite · dormiu 7h 30m · com estágios · valores 3 · Garmin Connect/);
  assert.deepEqual(formatSleepSessionsDebug([]).rows, [{ label: 'Sessões', value: 'nenhuma na janela lida' }]);
});

test('texto do trecho parcial e do estado aguardando', () => {
  assert.equal(
    formatPartialSleepNote(new Date(2026, 10, 16, 9, 52).toISOString(), new Date(2026, 10, 16, 11, 54).toISOString(), 122),
    'Recebemos só um trecho (09:52–11:54, 2h 02m). Abra o app do seu relógio para sincronizar a noite completa.'
  );
  assert.equal(SLEEP_WAITING_TITLE, 'Aguardando a noite completa.');
});
