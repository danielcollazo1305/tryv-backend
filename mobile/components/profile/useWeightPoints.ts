import { useCallback, useEffect, useRef, useState } from 'react';

import type { WeightPoint } from '@/services/dashboard';
import { listWeightLogs } from '@/services/weightLogs';

/**
 * Peso dos ultimos 30 dias para a aba Progresso. Vive na TELA de perfil (nao dentro da aba) para o resultado sobreviver quando a lista
 * remonta (trocar entre Galeria e as outras abas remonta a FlatList): so busca na 1a vez que a aba abre, e guarda o resultado.
 */
export function useWeightPoints(active: boolean) {
  const [points, setPoints] = useState<WeightPoint[] | null>(null);
  const [error, setError] = useState(false);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    setError(false);
    listWeightLogs('30d')
      .then((logs) => {
        if (mountedRef.current) setPoints(logs.map((log) => ({ date: log.logged_at, weight_kg: log.weight_kg })));
      })
      .catch(() => {
        if (mountedRef.current) setError(true);
      });
  }, []);

  useEffect(() => {
    if (active && !startedRef.current) {
      startedRef.current = true;
      load();
    }
  }, [active, load]);

  return { points, error, retry: load };
}
