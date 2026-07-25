import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function ProfileScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={32} color={colors.accent} />
      </View>
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <Card style={styles.card}>
        <Text style={styles.cardText}>
          Mais opcoes de perfil (peso, altura, objetivo, assinatura) chegam em breve.
        </Text>
      </Card>
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
  card: { width: '100%' },
  cardText: { ...typography.bodySecondary, textAlign: 'center' },
});
