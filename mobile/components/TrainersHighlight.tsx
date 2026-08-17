import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { ImageCoverCard } from '@/components/ImageCoverCard';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { getMyTrainerProfile } from '@/services/trainers';
import { colors2, spacing2, typography2 } from '@/constants/theme';

/**
 * Destaque do marketplace de professores na Home. Card principal com
 * imagem de capa (acompanhamento-profissional-card.png) leva pro passo
 * intermediario de selecao de categoria (trainers/select-type.tsx) em vez
 * de ir direto pra listagem — fluxo em 2 passos pedido na reorganizacao da
 * Home. Linha secundaria (virar parceiro) preservada abaixo, sem mudanca
 * de logica — so deixou de morar dentro do mesmo LiquiglassCard porque o
 * card principal virou um card de imagem (ImageCoverCard), que nao pode
 * conter outro Pressable dentro sem conflito de toque.
 */
export function TrainersHighlight() {
  const [isTrainer, setIsTrainer] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;

  // Mesmo padrao de deteccao usado no Perfil: tenta buscar o perfil de
  // professor do usuario logado, 404 (ou qualquer falha) significa "ainda
  // nao e professor" — sempre uma opcao segura.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMyTrainerProfile()
        .then(() => {
          if (active) setIsTrainer(true);
        })
        .catch(() => {
          if (active) setIsTrainer(false);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  // Entrada com fade + leve deslize pra cima, uma unica vez quando a Home monta.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  return (
    <Animated.View style={[styles.wrapper, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <ImageCoverCard
        image={require('../assets/imagens/acompanhamento-profissional-card.png')}
        title="Acompanhamento profissional"
        subtitle="Tenha treino ou nutricao acompanhados por profissionais da area."
        accessibilityLabel="Personal trainer orientando um aluno durante o treino"
        onPress={() => router.push('/trainers/select-type')}
      />

      <LiquiglassCard style={styles.secondaryCard} padding={spacing2.md}>
        <Pressable
          style={styles.secondaryRow}
          onPress={() => router.push(isTrainer ? '/trainers/me' : '/trainers/register')}
        >
          <Text style={styles.secondaryText}>
            {isTrainer
              ? 'Voce e nosso parceiro — ver meu painel'
              : 'E personal trainer ou nutricionista? Seja nosso parceiro'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors2.primary} />
        </Pressable>
      </LiquiglassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing2.sm },
  secondaryCard: { paddingVertical: spacing2.sm },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryText: { ...typography2.bodyMd, fontSize: 14, color: colors2.primary, flex: 1, marginRight: spacing2.sm },
});
