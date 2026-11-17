import AsyncStorage from '@react-native-async-storage/async-storage';

/** Chave do modo desenvolvedor (preferencia do APARELHO, nao da conta: nao e apagada na exclusao de conta). */
export const DEV_MODE_KEY = 'dev_mode_enabled_v1';

export async function isDevModeEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEV_MODE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setDevModeEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await AsyncStorage.setItem(DEV_MODE_KEY, 'true');
    else await AsyncStorage.removeItem(DEV_MODE_KEY);
  } catch {
    // sem armazenamento: o modo so vale ate fechar o app
  }
}
