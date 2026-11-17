import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { DynamicVitality, getVitalitySnapshot, refreshVitality, subscribeVitality } from '@/services/vitalityService';
import { VitalityState } from '@/services/vitality';

export type VitalityLoad = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; vitality: DynamicVitality };

/**
 * Vitalidade DINAMICA, valor UNICO para todas as telas (Home, aba Treino, Treinar) e o widget: vem do servico services/vitalityService.ts, que le o Apple Saude
 * no aparelho e o /readiness/today e roda as funcoes puras. Todas as telas montadas compartilham o mesmo calculo (sem consultas duplicadas). Atualiza ao ganhar
 * foco (no maximo 1x por minuto); `fetchData` forca uma atualizacao agora (tentar de novo, botao, gesto de puxar). Acompanha "reduzir movimento".
 */
export function useVitality() {
  const snapshot = useSyncExternalStore(subscribeVitality, getVitalitySnapshot, getVitalitySnapshot);
  const [reduceMotion, setReduceMotion] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshVitality();
    }, [])
  );

  const fetchData = useCallback(() => refreshVitality({ force: true }), []);

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

  const vitality = snapshot.vitality;
  const load: VitalityLoad = vitality ? { kind: 'ok', vitality } : snapshot.error ? { kind: 'error' } : { kind: 'loading' };
  const state: VitalityState = vitality ? vitality.state : 'nodata';

  return { load, fetchData, reduceMotion, vitality, state, refreshing: snapshot.refreshing };
}
