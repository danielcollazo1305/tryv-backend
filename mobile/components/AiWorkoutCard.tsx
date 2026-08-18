import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';

import { ImageCoverCard } from '@/components/ImageCoverCard';
import { isWorkoutPlanExpired, listWorkoutPlans } from '@/services/workouts';

/**
 * "Treino com IA" — card novo da Home. Reaproveita listWorkoutPlans()
 * (mesmo endpoint livre ja usado por (tabs)/workout.tsx) so pra decidir o
 * texto: com plano ativo (nao expirado), convida a ver o treino; sem
 * plano valido — nunca teve um, ou o unico que existe ja expirou —
 * convida a gerar um novo. A tela de destino (workout.tsx) ja sabe
 * mostrar o estado certo (vazio/expirado/com plano) sozinha — este card
 * so ajusta o convite.
 */
export function AiWorkoutCard() {
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listWorkoutPlans()
        .then((plans) => {
          if (active) setHasPlan(plans.some((plan) => !isWorkoutPlanExpired(plan)));
        })
        .catch(() => {
          if (active) setHasPlan(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <ImageCoverCard
      image={require('../assets/imagens/treino-ia-card.png')}
      title={hasPlan ? 'Ver meu treino' : 'Treino com IA'}
      subtitle={hasPlan ? 'Continue seu plano semanal' : 'Gere um plano de treino personalizado'}
      accessibilityLabel="Pessoa treinando com halteres em uma academia"
      onPress={() => router.push('/(tabs)/workout')}
    />
  );
}
