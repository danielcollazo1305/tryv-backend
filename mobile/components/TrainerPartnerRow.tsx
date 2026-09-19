import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { getMyTrainerProfile } from '@/services/trainers';
import { colors3, spacing3, typography3 } from '@/constants/theme';

/**
 * Linha secundaria "seja nosso parceiro" — extraida de TrainersHighlight
 * quando o card principal virou um slide fixo do carrossel "Para voce"
 * (EditorialCard nao pode conter outro Pressable dentro sem conflito de
 * toque, e o HTML de referencia nao mostra esse link dentro do card de
 * imagem). Renderizada fora do carrossel, logo abaixo dele. Retemada pro
 * sistema visual novo "prism-glass" — banner inteiro tocavel, texto em
 * on-surface (nao mais roxo) igual ao HTML de origem.
 */
export function TrainerPartnerRow() {
  const [isTrainer, setIsTrainer] = useState(false);

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

  return (
    <Pressable onPress={() => router.push(isTrainer ? '/trainers/me' : '/trainers/register')}>
      <GlassCard style={styles.card} padding={spacing3.md}>
        <Text style={styles.text}>
          {isTrainer ? 'Você é nosso parceiro — ver meu painel' : 'É personal trainer ou nutricionista? Seja nosso parceiro'}
        </Text>
        <Ionicons name="chevron-forward" size={20} color={colors3.outline} />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text: { ...typography3.bodyMd, fontSize: 14, color: colors3.onSurface, flex: 1, marginRight: spacing3.sm },
});
