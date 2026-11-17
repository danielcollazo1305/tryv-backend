import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import * as SecureStore from 'expo-secure-store';

import { HEALTHKIT_CONNECTED_KEY, fetchHealthSummary, fetchSleepHoursWokenToday } from '@/services/healthkit';
import { hasBasalEnergy } from '@/services/healthkitState';
import { refreshVitality } from '@/services/vitalityService';
import { widgetVitalityFields } from '@/services/vitalityView';

/**
 * Resumo do dia para o widget de TELA INICIAL (mobile/TryvFitWidgets/TryvFitSummaryWidget.swift). O app monta este JSON, o modulo nativo
 * (Module.swift, writeDailySummary) grava no App Group (chave "dailySummary.v1") e pede o reload do widget. O widget so le: sem rede, sem
 * HealthKit. Os dados ficam so no aparelho (o readiness vem do backend como ja vem para a tela Treino; o widget em si nao envia nada).
 */

/** Meta diaria de passos mostrada no widget. Constante unica: troque aqui (o Swift usa o valor do JSON). */
export const WIDGET_STEP_GOAL = 10000;

/** Intervalo minimo entre gravacoes automaticas (abrir o app, voltar ao primeiro plano): cada gravacao pede reload do widget, e o iOS limita quantos reloads por dia ele concede. */
const MIN_INTERVAL_MS = 5 * 60 * 1000;
/** Pausa minima entre gravacoes quando a pessoa pede (botao/gesto de atualizar): menor, mas nunca sem limite. */
export const MANUAL_MIN_INTERVAL_MS = 60 * 1000;

/** Formato lido pelo Swift (SummaryPayload). v = versao do formato; campo sem dado vai como null. */
export interface WidgetSummaryPayload {
  v: 1;
  /** Epoch em ms de quando o app gravou (o rodape "Atualizado as HH:mm" do widget). */
  updatedAt: number;
  steps: number | null;
  stepGoal: number;
  /** Horas da noite que ANCORA o ciclo da Vitalidade (a ultima noite principal; atravessa a meia-noite), a mesma do app; sem ela, as horas da noite que terminou hoje. */
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

  const [summary, wokenTodayHours] = await Promise.all([fetchHealthSummary(), fetchSleepHoursWokenToday().catch(() => null)]);
  payload.steps = roundOrNull(summary.stepsToday); // contador do DIA do calendario (sem leitura desde 00:00 = null = "—": dado ausente continua ausente)
  payload.activeKcal = roundOrNull(summary.activeEnergyTodayKcal);
  payload.basalKcal = hasBasalEnergy(summary.basalEnergyTodayKcal) ? roundOrNull(summary.basalEnergyTodayKcal) : null;

  // Vitalidade: o MESMO valor dinamico do app (services/vitalityService.ts, o das telas), nunca um calculo proprio (widgetVitalityFields garante rotulo e numero iguais).
  // O sono mostrado e o da noite que ANCORA o ciclo (a mesma que a Vitalidade usa; atravessa a meia-noite), e so na falta dela, o da noite que terminou hoje.
  let cycleSleepHours: number | null = null;
  try {
    const vitality = await refreshVitality();
    Object.assign(payload, widgetVitalityFields(vitality));
    cycleSleepHours = vitality?.cycle.sleepHours ?? null;
  } catch {
    // mantem null
  }
  const sleepHours = cycleSleepHours ?? wokenTodayHours;
  payload.sleepHours = typeof sleepHours === 'number' && Number.isFinite(sleepHours) ? Math.round(sleepHours * 1000) / 1000 : null;
  return payload;
}

let inFlight: Promise<void> | null = null;
let lastWriteAt = 0;

/**
 * Limpa o widget (logout): grava o resumo VAZIO (tudo null), entao ele volta a mostrar "Abra o Tryv para sincronizar" em vez dos dados da pessoa que saiu. Espera
 * uma gravacao em andamento terminar antes (senao ela poderia reescrever os dados antigos depois). Nunca lanca; so iOS.
 */
export async function clearWidgetSummary(): Promise<void> {
  if (Platform.OS !== 'ios' || !nativeModule) return;
  try {
    if (inFlight) await inFlight.catch(() => undefined);
    lastWriteAt = 0;
    await nativeModule.writeDailySummary(JSON.stringify(emptyPayload()));
  } catch (error) {
    console.error('[widgetSummary] falha ao limpar o resumo do widget', error);
  }
}

/**
 * Atualiza o widget com os dados de agora. Seguro chamar a vontade ("fire and forget"): so iOS, nunca lanca erro, ignora chamadas enquanto
 * outra esta em andamento e grava no maximo 1 vez a cada 5 min (o reload do widget conta no orcamento diario do iOS). Com { manual: true } (botao/gesto
 * de atualizar) a pausa minima e de 60 s.
 */
export function syncWidgetSummary(options?: { manual?: boolean }): Promise<void> {
  if (Platform.OS !== 'ios' || !nativeModule) return Promise.resolve();
  if (inFlight) return inFlight;
  const minInterval = options?.manual ? MANUAL_MIN_INTERVAL_MS : MIN_INTERVAL_MS;
  if (Date.now() - lastWriteAt < minInterval) return Promise.resolve();

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
