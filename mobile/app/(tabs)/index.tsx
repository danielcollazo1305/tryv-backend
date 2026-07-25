import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Ola, {firstName}</Text>
          <Text style={styles.subtitle}>Vamos treinar hoje?</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton} hitSlop={12}>
          <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Card style={styles.statsCard}>
        <Text style={styles.cardTitle}>Esta semana</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>0.0</Text>
            <Text style={styles.statLabel}>km corridos</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>kcal ativas</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>treinos</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.placeholderCard}>
        <View style={styles.placeholderIconWrap}>
          <Ionicons name="flame" size={24} color={colors.accent} />
        </View>
        <Text style={styles.cardTitle}>Ultima atividade</Text>
        <Text style={styles.placeholderText}>
          Suas corridas, treinos e refeicoes registradas vao aparecer aqui.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  greeting: { ...typography.h1 },
  subtitle: { ...typography.bodySecondary, marginTop: spacing.xs },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsCard: { gap: spacing.md },
  cardTitle: { ...typography.h3 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  statNumber: { ...typography.statNumber },
  statLabel: { ...typography.statLabel, marginTop: spacing.xs },
  placeholderCard: { alignItems: 'flex-start', gap: spacing.sm },
  placeholderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  placeholderText: { ...typography.bodySecondary },
});
