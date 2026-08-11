import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { getMyTrainerProfile } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

/**
 * Destaque do marketplace de professores na Home. Uma unica secao com duas
 * chamadas (aluno em primeiro plano, professor como linha secundaria) em vez
 * de dois cards do mesmo tamanho competindo por atencao — a maioria dos
 * usuarios e aluno, entao o CTA de aluno e o "hero" do card.
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
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <Card style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="ribbon" size={22} color={colors.accent} />
        </View>
        <Text style={styles.title}>Acompanhamento profissional</Text>
        <Text style={styles.subtitle}>Tenha treino ou nutricao acompanhados por profissionais da area.</Text>
        <Button label="Ver profissionais" onPress={() => router.push('/trainers')} />

        <View style={styles.divider} />

        <Pressable
          style={styles.secondaryRow}
          onPress={() => router.push(isTrainer ? '/trainers/me' : '/trainers/register')}
        >
          <Text style={styles.secondaryText}>
            {isTrainer
              ? 'Voce e nosso parceiro — ver meu painel'
              : 'E personal trainer ou nutricionista? Seja nosso parceiro'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </Pressable>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { ...typography.h3 },
  subtitle: { ...typography.bodySecondary },
  divider: { height: 1, backgroundColor: colors.border, marginTop: spacing.xs },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryText: { ...typography.bodySecondary, color: colors.accent, flex: 1, marginRight: spacing.sm },
});
