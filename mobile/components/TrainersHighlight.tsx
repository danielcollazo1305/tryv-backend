import React from 'react';
import { router } from 'expo-router';

import { EditorialCard } from '@/components/EditorialCardV2';

/**
 * "Acompanhamento profissional" — slide do carrossel "Para voce" da Home.
 * Leva pro passo intermediario de selecao de categoria
 * (trainers/select-type.tsx) em vez de ir direto pra listagem — fluxo em
 * 2 passos pedido na reorganizacao da Home. A linha secundaria (virar
 * parceiro) mora em TrainerPartnerRow, renderizada fora do carrossel (ver
 * (tabs)/index.tsx) — o HTML de referencia nao mostra esse link dentro do
 * card de imagem.
 */
export function TrainersHighlight() {
  return (
    <EditorialCard
      image={require('../assets/imagens/acompanhamento-profissional-card.png')}
      icon="people"
      categoryLabel="Marketplace"
      title="Acompanhamento real"
      subtitle="Personal trainers e nutricionistas verificados, do seu lado."
      accessibilityLabel="Personal trainer orientando um aluno durante o treino"
      onPress={() => router.push('/trainers/select-type')}
      ctaLabel="Ver profissionais"
    />
  );
}
