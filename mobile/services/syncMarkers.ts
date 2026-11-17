import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { clearSyncMarkersIn, setMarkerIfCurrent, type MarkerStore } from '@/utils/syncMarkers';

export {
  AUTO_IMPORT_ANCHOR_KEY,
  AUTO_IMPORT_LAST_RUN_KEY,
  HEART_RATE_LAST_RUN_KEY,
  HEART_RATE_LAST_SYNC_KEY,
  getSyncMarkersGeneration,
} from '@/utils/syncMarkers';

const secureStore: MarkerStore = {
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

/** Logout e exclusao de conta: apaga as 4 chaves de sincronizacao do aparelho e invalida sincronizacoes em andamento. Nunca lanca. */
export function clearSyncMarkers(): Promise<string[]> {
  return clearSyncMarkersIn(AsyncStorage, secureStore);
}

/** Grava marcador no AsyncStorage so se nao houve limpeza desde `generation` (ver utils/syncMarkers.ts). */
export function setAsyncMarkerIfCurrent(key: string, value: string, generation: number): Promise<boolean> {
  return setMarkerIfCurrent(AsyncStorage, key, value, generation);
}

/** Idem, no SecureStore. */
export function setSecureMarkerIfCurrent(key: string, value: string, generation: number): Promise<boolean> {
  return setMarkerIfCurrent(secureStore, key, value, generation);
}
