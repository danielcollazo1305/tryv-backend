import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { getMyTrainerProfile } from '@/services/trainers';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [isTrainer, setIsTrainer] = useState(false);

  // Qualquer falha (404 de "ainda nao e professor" ou erro de rede) cai no
  // mesmo estado — o link "Tornar-se professor" e sempre uma opcao segura.
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
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={32} color={colors.accent} />
      </View>
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <Pressable style={styles.optionWrap} onPress={() => router.push('/trainers')}>
        <Card style={styles.optionCard}>
          <View style={styles.optionIconWrap}>
            <Ionicons name="people" size={20} color={colors.accent} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Professores</Text>
            <Text style={styles.optionSubtitle}>Encontre um professor certificado</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      <Pressable
        style={styles.optionWrap}
        onPress={() => router.push(isTrainer ? '/trainers/me' : '/trainers/register')}
      >
        <Card style={styles.optionCard}>
          <View style={styles.optionIconWrap}>
            <Ionicons name={isTrainer ? 'clipboard' : 'ribbon'} size={20} color={colors.accent} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>
              {isTrainer ? 'Meu painel de professor' : 'Tornar-se professor'}
            </Text>
            <Text style={styles.optionSubtitle}>
              {isTrainer
                ? 'Status, edicao de perfil e pagamentos'
                : 'Cadastre seu CREF e comece a dar aulas'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingTop: spacing.xxl,
    padding: spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  name: { ...typography.h2 },
  email: { ...typography.bodySecondary, marginTop: spacing.xs, marginBottom: spacing.xl },

  optionWrap: { width: '100%', marginBottom: spacing.sm },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: { flex: 1, gap: spacing.xs },
  optionTitle: { ...typography.body, fontWeight: '600' },
  optionSubtitle: { ...typography.caption },
});
