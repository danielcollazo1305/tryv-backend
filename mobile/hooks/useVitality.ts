import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { HEALTHKIT_CONNECTED_KEY } from '@/components/HealthSummaryCard';
import { fetchLastNightSleepHours } from '@/services/health';
import { getTodayReadiness, Readiness } from '@/services/readiness';
import { VitalityState, readinessToState } from '@/services/vitality';

export type VitalityLoad = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; readiness: Readiness };

/**
 * Dados da Vitalidade, compartilhados pelo card da tela Treino (VitalityMonitor) e pelo da tela Treinar (RetroVitality). Busca a prontidao ao
 * ganhar foco (o sono do HealthKit so entra se o usuario ja conectou; este hook nunca pede permissao) e acompanha "reduzir movimento".
 */
export function useVitality() {
  const [load, setLoad] = useState<VitalityLoad>({ kind: 'loading' });
  const [reduceMotion, setReduceMotion] = useState(false);

  const fetchData = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      let sleepHours: number | null = null;
      if (Platform.OS === 'ios') {
        const connected = (await SecureStore.getItemAsync(HEALTHKIT_CONNECTED_KEY)) === 'true';
        if (connected) {
          try {
            sleepHours = await fetchLastNightSleepHours();
          } catch {
            sleepHours = null;
          }
        }
      }
      setLoad({ kind: 'ok', readiness: await getTodayReadiness(sleepHours) });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const readiness = load.kind === 'ok' ? load.readiness : null;
  const state: VitalityState = load.kind === 'ok' ? readinessToState(readiness) : 'nodata';

  return { load, fetchData, reduceMotion, readiness, state };
}
