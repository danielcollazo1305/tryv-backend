import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { shouldRunOnActive } from '@/utils/appActive';

/**
 * Roda `callback` quando o app volta ao primeiro plano (AppState -> 'active'), no maximo 1 vez a cada `minIntervalMs`. Usado para reler o sono (o relogio sincroniza
 * com o Apple Saude enquanto o app esta em segundo plano) e atualizar a Vitalidade. O callback pode mudar entre renders sem reinscrever o listener.
 */
export function useOnAppActive(callback: () => void, minIntervalMs = 0): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let previous: string = AppState.currentState;
    let lastRunAt = 0;
    const subscription = AppState.addEventListener('change', (next) => {
      const now = Date.now();
      if (shouldRunOnActive(previous, next, lastRunAt, now, minIntervalMs)) {
        lastRunAt = now;
        callbackRef.current();
      }
      previous = next;
    });
    return () => subscription.remove();
  }, [minIntervalMs]);
}
