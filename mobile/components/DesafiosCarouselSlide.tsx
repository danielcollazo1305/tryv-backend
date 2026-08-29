import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';

import { EditorialCard } from '@/components/EditorialCardV2';
import {
  Challenge,
  buildAutomaticChallengeHeatmapDays,
  buildChallengeHeatmapDays,
  challengeDayProgress,
  describeChallengeGoal,
  getChallengeProgress,
  listMyActiveChallenges,
  listMyChallengeCheckins,
  parseUtcDate,
} from '@/services/challenges';

function monthLabel(date: Date): string {
  const label = date.toLocaleDateString('pt-BR', { month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * "Desafios" — slide do carrossel "Para voce" da Home. So considera
 * desafios "App" (is_official) aqui, mesmo escopo que a versao anterior
 * (progresso de desafios "Personal" fica no Perfil). Com mais de um
 * desafio oficial ativo ao mesmo tempo, mostra o primeiro (mesma
 * simplificacao ja usada em WorkoutScreen pra aiPlan/trainerPlan —
 * `plans.find(...)`) em vez de um sub-carrossel dentro do carrossel.
 *
 * O HTML de referencia so modela o estado "sem desafio ativo" (categoria
 * "Comunidade", CTA "Ver desafios", sem barra de progresso) — o estado
 * "com desafio ativo" (barra de progresso real) e uma adicao que preserva
 * o dado real ja existente (nao fazia sentido regredir uma funcionalidade
 * real so porque o mockup nao cobre esse estado). "61/100 km" que apareceria
 * num mockup generico nao tem fonte real (getChallengeProgress so devolve
 * achieved:boolean por dia, nao uma soma de km/proteina) — a barra usa
 * "dias cumpridos de dias corridos", que e o dado real equivalente.
 */
export function DesafiosCarouselSlide() {
  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined);
  const [progressPercent, setProgressPercent] = useState(0);
  const [daysAchieved, setDaysAchieved] = useState(0);
  const [daysTotal, setDaysTotal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listMyActiveChallenges({ is_official: true })
        .then(async (active_) => {
          const first = active_[0] ?? null;
          if (!active) return;
          setChallenge(first);
          if (!first) return;
          const heatmap =
            first.goal_type === 'manual'
              ? buildChallengeHeatmapDays(first, await listMyChallengeCheckins(first.id))
              : buildAutomaticChallengeHeatmapDays(first, await getChallengeProgress(first.id));
          if (!active) return;
          const achieved = heatmap.filter((d) => d.intensity > 0).length;
          setDaysAchieved(achieved);
          setDaysTotal(heatmap.length);
          setProgressPercent(heatmap.length > 0 ? achieved / heatmap.length : 0);
        })
        .catch(() => {
          if (active) setChallenge(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  if (challenge === undefined) return null;

  if (!challenge) {
    return (
      <EditorialCard
        image={require('../assets/imagens/desafios-card.png')}
        icon="trophy"
        categoryLabel="Comunidade"
        title="Desafios"
        subtitle="Acompanhe desafios dos seus profissionais e da comunidade Tryv."
        accessibilityLabel="Grupo de pessoas correndo ao entardecer"
        onPress={() => router.push('/challenges')}
        ctaLabel="Ver desafios"
      />
    );
  }

  const { current, total } = challengeDayProgress(challenge);

  return (
    <EditorialCard
      image={require('../assets/imagens/desafios-card.png')}
      icon="trophy"
      categoryLabel={`${monthLabel(parseUtcDate(challenge.start_date))} · Dia ${current} de ${total}`}
      title={challenge.title}
      subtitle={describeChallengeGoal(challenge) ?? 'Faça seu check-in diário e acompanhe sua sequência.'}
      accessibilityLabel={`Prévia de progresso do desafio ${challenge.title}`}
      onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } })}
      progress={{ percent: progressPercent, label: `${daysAchieved} de ${daysTotal} dias` }}
    />
  );
}
