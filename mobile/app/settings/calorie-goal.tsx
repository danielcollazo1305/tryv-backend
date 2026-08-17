import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { ObscuredCard } from '@/components/ObscuredCard';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TextField2 } from '@/components/TextField2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { updateProfile } from '@/services/user';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

// Valores fixos so pra dar dimensao/estrutura ao card ofuscado — nunca
// aparecem legiveis (o blur cobre tudo), nao representam dado real.
const MACRO_ROWS = [
  { label: 'Proteinas', grams: 0, percent: 40, color: colors2.violet },
  { label: 'Carboidratos', grams: 0, percent: 65, color: colors2.primary },
  { label: 'Gorduras', grams: 0, percent: 25, color: colors2.success },
];

/**
 * Extraida do card inline de edicao que existia em (tabs)/profile.tsx,
 * seguindo o layout de tela dedicada do mockup config-meta-calorica.html.
 *
 * Lacuna de dado: o mockup tem uma secao "Distribuicao de Macros"
 * (Proteinas/Carboidratos/Gorduras em gramas, com barra de progresso).
 * O modelo User no backend so tem daily_calorie_goal — nao existe
 * daily_protein_goal/carbs_goal/fat_goal em lugar nenhum (o campo de
 * macros que existe hoje pertence a Plano Alimentar, atribuido por um
 * nutricionista a um aluno especifico — tabela e conceito diferentes,
 * NAO deve ser confundido com este). Em vez de omitir a secao, ela usa o
 * padrao ObscuredCard (blur + cadeado) — o card de calorias acima
 * continua o formulario real e editavel, intocado.
 */
export default function CalorieGoalScreen() {
  const { user, refreshUser } = useAuth();
  const [calorieGoalInput, setCalorieGoalInput] = useState(
    user?.daily_calorie_goal != null ? String(user.daily_calorie_goal) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const value = Number(calorieGoalInput);
    if (!value || value <= 0) {
      setError('Informe uma meta valida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ daily_calorie_goal: value });
      await refreshUser();
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar a meta.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground2 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors2.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.title}>Meta Calorica Diaria</Text>
          <Text style={styles.subtitle}>Ajuste seu objetivo de nutricao.</Text>
        </View>

        <LiquiglassCard style={styles.card}>
          <TextField2
            label="Objetivo de calorias (kcal)"
            placeholder="Ex: 2200"
            keyboardType="number-pad"
            value={calorieGoalInput}
            onChangeText={setCalorieGoalInput}
            style={styles.input}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.hint}>Esta meta e usada para calcular seu progresso diario e sugerir refeicoes ideais.</Text>

          <Button2 label="Salvar alteracoes" onPress={handleSave} loading={saving} />
        </LiquiglassCard>

        <View style={styles.macrosIntro}>
          <Text style={styles.macrosTitle}>Distribuicao de Macros</Text>
        </View>
        <ObscuredCard style={styles.macrosCard}>
          {MACRO_ROWS.map((row) => (
            <View key={row.label} style={styles.macroRow}>
              <View style={styles.macroRowHeader}>
                <Text style={styles.macroLabel}>{row.label}</Text>
                <Text style={styles.macroValue}>{row.grams}g</Text>
              </View>
              <View style={styles.macroBarTrack}>
                <View style={[styles.macroBarFill, { width: `${row.percent}%`, backgroundColor: row.color }]} />
              </View>
            </View>
          ))}
        </ObscuredCard>
      </ScrollView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.lg },

  intro: { gap: spacing2.xs },
  title: { ...typography2.headlineLgMobile, fontSize: 24 },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },

  card: { gap: spacing2.md },
  input: { marginBottom: 0 },
  error: { color: colors2.danger, textAlign: 'center' },
  hint: {
    ...typography2.bodyMd,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors2.onSurfaceVariant,
    borderLeftWidth: 3,
    borderLeftColor: colors2.violet,
    paddingLeft: spacing2.sm,
  },

  macrosIntro: { marginTop: spacing2.xs },
  macrosTitle: { ...typography2.headlineMd, fontSize: 16 },
  macrosCard: {
    backgroundColor: colors2.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.md,
    padding: spacing2.md,
    gap: spacing2.md,
  },
  macroRow: { gap: spacing2.xs },
  macroRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroLabel: { ...typography2.bodyMd, fontSize: 13, fontWeight: '600' },
  macroValue: { ...typography2.metricMono, fontSize: 13, color: colors2.onSurfaceVariant },
  macroBarTrack: {
    height: 6,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    overflow: 'hidden',
  },
  macroBarFill: { height: '100%', borderRadius: radius2.pill },
});
