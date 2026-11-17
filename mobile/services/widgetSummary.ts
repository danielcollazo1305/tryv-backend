import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import * as SecureStore from 'expo-secure-store';

import { HEALTHKIT_CONNECTED_KEY, fetchHealthSummary, fetchSleepHoursWokenToday } from '@/services/healthkit';
import { hasBasalEnergy } from '@/services/healthkitState';
import { getTodayReadiness } from '@/services/readiness';
import { VITALITY_LABELS, readinessToState } from '@/services/vitality';

/**
 * Resumo do dia para o widget de TELA INICIAL (mobile/TryvFitWidgets/TryvFitSummaryWidget.swift). O app monta este JSON, o modulo nativo
 * (Module.swift, writeDailySummary) grava no App Group (chave "dailySummary.v1") e pede o reload do widget. O widget so le: sem rede, sem
 * HealthKit. Os dados ficam so no aparelho (o readiness vem do backend como ja vem para a tela Treino; o widget em si nao envia nada).
 */

/** Meta diaria de passos mostrada no widget. Constante unica: troque aqui (o Swift usa o valor do JSON). */
export const WIDGET_STEP_GOAL = 10000;

/** Intervalo minimo entre gravacoes: cada gravacao pede reload do widget, e o iOS limita quantos reloads por dia ele concede. */
const MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Formato lido pelo Swift (SummaryPayload). v = versao do formato; campo sem dado vai como null. */
export interface WidgetSummaryPayload {
  v: 1;
  /** Epoch em ms de quando o app gravou (o rodape "Atualizado as HH:mm" do widget). */
  updatedAt: number;
  steps: number | null;
  stepGoal: number;
  /** Horas da noite que terminou HOJE (dia em que acordou), via sleepHoursByWakeDay. */
  sleepHours: number | null;
  activeKcal: number | null;
  /** So vem preenchida se ha basal de verdade (> 0); sem ela o widget mostra "Calorias ativas", nunca "total". */
  basalKcal: number | null;
  vitalityLabel: string | null;
  vitalityScore: number | null;
}

interface WidgetNativeModule {
  writeDailySummary(json: string): Promise<void>;
}

let nativeModule: WidgetNativeModule | null = null;
if (Platform.OS === 'ios') {
  try {
    nativeModule = requireNativeModule<WidgetNativeModule>('TryvFitWidgets');
  } catch (error) {
    // Build sem o plugin do widget: o resumo simplesmente nao e gravado.
    console.error('[widgetSummary] modulo nativo TryvFitWidgets nao encontrado', error);
  }
}

const roundOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

function emptyPayload(): WidgetSummaryPayload {
  return {
    v: 1,
    updatedAt: Date.now(),
    steps: null,
    stepGoal: WIDGET_STEP_GOAL,
    sleepHours: null,
    activeKcal: null,
    basalKcal: null,
    vitalityLabel: null,
    vitalityScore: null,
  };
}

async function buildPayload(): Promise<WidgetSummaryPayload> {
  const payload = emptyPayload();
  // Sem o Apple Saude conectado grava o resumo VAZIO (tudo null): o widget mostra "Abra o Tryv para sincronizar" em vez de dados antigos.
  const connected = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
  if (!connected) return payload;

  const [summary, sleepHours] = await Promise.all([fetchHealthSummary(), fetchSleepHoursWokenToday().catch(() => null)]);
  payload.steps = roundOrNull(summary.stepsToday);
  payload.activeKcal = roundOrNull(summary.activeEnergyTodayKcal);
  payload.basalKcal = hasBasalEnergy(summary.basalEnergyTodayKcal) ? roundOrNull(summary.basalEnergyTodayKcal) : null;
  payload.sleepHours = typeof sleepHours === 'number' && Number.isFinite(sleepHours) ? Math.round(sleepHours * 1000) / 1000 : null;

  // Vitalidade: mesmo calculo do card da tela Treino (readiness do backend com o sono do mesmo fetch). Falha = sem vitalidade, o resto segue.
  try {
    const readiness = await getTodayReadiness(summary.sleepLastNightHours);
    const state = readinessToState(readiness);
    if (state !== 'nodata') {
      payload.vitalityLabel = VITALITY_LABELS[state];
      payload.vitalityScore = roundOrNull(readiness.final_score);
    }
  } catch {
    // mantem null
  }
  return payload;
}

let inFlight: Promise<void> | null = null;
let lastWriteAt = 0;

/**
 * Atualiza o widget com os dados de agora. Seguro chamar a vontade ("fire and forget"): so iOS, nunca lanca erro, ignora chamadas enquanto
 * outra esta em andamento e grava no maximo 1 vez a cada 5 min (o reload do widget conta no orcamento diario do iOS).
 */
export function syncWidgetSummary(): Promise<void> {
  if (Platform.OS !== 'ios' || !nativeModule) return Promise.resolve();
  if (inFlight) return inFlight;
  if (Date.now() - lastWriteAt < MIN_INTERVAL_MS) return Promise.resolve();

  const module = nativeModule;
  inFlight = (async () => {
    try {
      await module.writeDailySummary(JSON.stringify(await buildPayload()));
      lastWriteAt = Date.now();
    } catch (error) {
      console.error('[widgetSummary] falha ao gravar o resumo do widget', error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
