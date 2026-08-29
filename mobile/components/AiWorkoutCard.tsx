import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';

import { EditorialCard } from '@/components/EditorialCardV2';
import { isWorkoutPlanExpired, listWorkoutPlans } from '@/services/workouts';

/**
 * "Treino com IA" — slide do carrossel "Para voce" da Home. Reaproveita
 * listWorkoutPlans() (mesmo endpoint livre ja usado por (tabs)/workout.tsx)
 * so pra decidir o texto: com plano ativo (nao expirado), convida a ver o
 * treino; sem plano valido — nunca teve um, ou o unico que existe ja
 * expirou — convida a gerar um novo. A tela de destino (workout.tsx) ja
 * sabe mostrar o estado certo (vazio/expirado/com plano) sozinha — este
 * card so ajusta o convite.
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
    <EditorialCard
      image={require('../assets/imagens/treino-ia-card.png')}
      icon="flash"
      categoryLabel="Inteligência"
      title={hasPlan ? 'Ver meu treino' : 'Treino com IA'}
      subtitle={
        hasPlan
          ? 'Continue seu plano semanal montado pela IA.'
          : 'Um plano montado a partir do seu histórico e da sua prontidão.'
      }
      accessibilityLabel="Pessoa treinando com halteres em uma academia"
      onPress={() => router.push('/(tabs)/workout')}
      ctaLabel={hasPlan ? 'Ver treino' : 'Saiba mais'}
    />
  );
}
