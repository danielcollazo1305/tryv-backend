import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { RoutePoint } from '@/services/activities';

export const LOCATION_TASK_NAME = 'tryv-background-run-tracking';

const STATE_FILE_PATH = `${FileSystem.documentDirectory}active-run-tracking.json`;

interface PersistedRunState {
  recording: boolean;
  points: RoutePoint[];
}

async function readState(): Promise<PersistedRunState> {
  try {
    const info = await FileSystem.getInfoAsync(STATE_FILE_PATH);
    if (!info.exists) return { recording: false, points: [] };
    const raw = await FileSystem.readAsStringAsync(STATE_FILE_PATH);
    return JSON.parse(raw) as PersistedRunState;
  } catch {
    return { recording: false, points: [] };
  }
}

async function writeState(state: PersistedRunState): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(STATE_FILE_PATH, JSON.stringify(state));
  } catch {
    // Persistencia em disco e so uma rede de seguranca pro trecho em
    // segundo plano — se falhar, a captura em PRIMEIRO plano (watchPositionAsync
    // em activity/new.tsx, nao tocada por este arquivo) continua funcionando
    // normalmente.
  }
}

/**
 * Registro da task em segundo plano. Isso PRECISA rodar incondicionalmente
 * no carregamento do modulo (efeito colateral no top-level, nao dentro de
 * um componente/useEffect) — e assim que o TaskManager exige pra
 * conseguir invocar a task de novo depois que o SO relanca o app so pra
 * processar uma atualizacao de localizacao (o app pode ser reiniciado do
 * zero nesse cenario, entao o registro precisa acontecer sempre que o JS
 * sobe, nao so quando o usuario abre a tela de corrida). Por isso este
 * arquivo e importado (por efeito colateral) uma unica vez em
 * app/_layout.tsx, nunca dentro de activity/new.tsx.
 *
 * A task so acrescenta pontos ao estado persistido se `recording` estiver
 * true — fora de uma corrida ativa, qualquer atualizacao que chegar aqui
 * (nao deveria, ja que so chamamos startLocationUpdatesAsync com uma
 * corrida em andamento) e ignorada.
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  const state = await readState();
  if (!state.recording) return;

  const newPoints: RoutePoint[] = locations.map((loc) => ({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    timestamp: new Date(loc.timestamp).toISOString(),
    alt: loc.coords.altitude,
  }));
  await writeState({ recording: true, points: [...state.points, ...newPoints] });
});

/**
 * Chamado quando o app vai pro segundo plano DURANTE uma corrida ativa (ver
 * AppState em activity/new.tsx) — nunca e o caminho principal de captura.
 * So tem efeito real se a permissao "Always" ja tiver sido concedida (ver
 * requestBackgroundLocationUpgrade); caso contrario e um no-op silencioso —
 * a corrida so vai continuar sendo gravada quando o app voltar ao primeiro
 * plano, exatamente o comportamento de hoje (item 7 do pedido).
 */
export async function startBackgroundTracking(): Promise<void> {
  const permission = await Location.getBackgroundPermissionsAsync();
  if (permission.status !== 'granted') return;

  await writeState({ recording: true, points: [] });

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 4000,
    distanceInterval: 10,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Tryv',
      notificationBody: 'Gravando sua atividade em segundo plano...',
    },
  });
}

/** Para a captura em segundo plano e devolve os pontos capturados nesse periodo, pro chamador mesclar na rota da corrida. */
export async function stopBackgroundTrackingAndFlush(): Promise<RoutePoint[]> {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
  }
  const state = await readState();
  await writeState({ recording: false, points: [] });
  return state.points;
}

/** Limpeza no fim/descarte da corrida — garante que nao sobra task rodando nem estado de uma sessao anterior. */
export async function clearBackgroundTrackingState(): Promise<void> {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
  }
  await FileSystem.deleteAsync(STATE_FILE_PATH, { idempotent: true }).catch(() => {});
}

/**
 * Fluxo de upgrade pra "Always", seguindo o padrao de 2 etapas recomendado
 * pela Apple: NUNCA chamado na primeira tela/permissao (essa continua
 * sendo so requestForegroundPermissionsAsync, sem alteracao — ver item 1
 * das regras de sempre). So deve ser chamado depois que o foreground ja
 * foi concedido E em contexto (ex: um banner opcional dentro da tela de
 * rastreamento ja em andamento, nunca automatico/forcado).
 */
export async function requestBackgroundLocationUpgrade(): Promise<boolean> {
  const response = await Location.requestBackgroundPermissionsAsync();
  return response.status === 'granted';
}

/**
 * true so quando ainda faz sentido oferecer o upgrade (permissao "Always"
 * nunca foi perguntada nem respondida) — depois que o usuario responde,
 * concedendo ou negando, o proprio SO passa a devolver 'granted'/'denied'
 * de forma estavel (getBackgroundPermissionsAsync nunca mais volta a
 * 'undetermined'), entao essa checagem sozinha ja evita reexibir o banner
 * indefinidamente, sem precisar guardar nenhuma preferencia separada.
 */
export async function shouldOfferBackgroundLocationUpgrade(): Promise<boolean> {
  const permission = await Location.getBackgroundPermissionsAsync();
  return permission.status === 'undetermined';
}
