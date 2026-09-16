import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ObscuredCard } from '@/components/ObscuredCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { updateProfile } from '@/services/user';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

// Valores fixos so pra dar dimensao/estrutura ao card ofuscado — nunca
// aparecem legiveis (o blur cobre tudo), nao representam dado real.
// So Carboidratos/Gorduras -- Proteinas saiu daqui (ver comentario da
// tela): daily_protein_goal agora e um campo real, editavel no card acima.
const MACRO_ROWS = [
  { label: 'Carboidratos', grams: 0, percent: 65, color: colors3.primary },
  { label: 'Gorduras', grams: 0, percent: 25, color: '#15803d' },
];

/**
 * Migrada pro tema claro "prism-glass" nesta tarefa (colors2 -> colors3,
 * LiquiglassCard -> GlassCard, Button2 -> Button3) e expandida com o campo
 * de meta de proteina diaria (daily_protein_goal), aprovado no mockup
 * "Metas de Nutricao". Tela renomeada de "Meta Calorica Diaria" (so
 * calorias) pra "Metas de Nutricao" (calorias + proteina).
 *
 * 1 card, 1 botao de salvar so pros 2 campos -- 1 PATCH /users/me com os
 * 2 valores juntos (ver handleSave), em vez de 2 formularios/acoes
 * separados.
 *
 * Secao "Distribuicao de Macros": os 3 valores (grams/percent) sempre
 * foram fixos/decorativos (ver MACRO_ROWS), nunca calculados a partir de
 * dado real -- so davam forma ao card ofuscado. Proteina saiu dessa lista
 * (nao faz mais sentido mostrar ela "borrada" ao lado de um campo que
 * agora e real e editavel logo acima). Carboidratos/Gorduras continuam
 * ofuscados com cadeado, sem alteracao -- nao existe daily_carbs_goal/
 * daily_fat_goal em lugar nenhum do backend ainda.
 */
export default function CalorieGoalScreen() {
  const { user, refreshUser } = useAuth();
  const [calorieGoalInput, setCalorieGoalInput] = useState(
    user?.daily_calorie_goal != null ? String(user.daily_calorie_goal) : ''
  );
  const [proteinGoalInput, setProteinGoalInput] = useState(
    user?.daily_protein_goal != null ? String(user.daily_protein_goal) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const calorieValue = Number(calorieGoalInput);
    if (!calorieValue || calorieValue <= 0) {
      setError('Informe uma meta de calorias valida.');
      return;
    }

    // Proteina e opcional -- string vazia fica de fora do payload (nao
    // vira 0 nem apaga uma meta ja definida). So valida se o usuario
    // digitou algo.
    let proteinValue: number | undefined;
    if (proteinGoalInput.trim() !== '') {
      proteinValue = Number(proteinGoalInput);
      if (!proteinValue || proteinValue <= 0) {
        setError('Informe uma meta de proteina valida, ou deixe em branco.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        daily_calorie_goal: calorieValue,
        ...(proteinValue != null ? { daily_protein_goal: proteinValue } : {}),
      });
      await refreshUser();
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar as metas.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors3.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tryv Fit</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.title}>Metas de Nutrição</Text>
          <Text style={styles.subtitle}>Ajuste seus objetivos diários.</Text>
        </View>

        <GlassCard variant="glass" style={styles.card}>
          <TextField2
            variant="light"
            label="Objetivo de calorias (kcal)"
            placeholder="Ex: 2200"
            keyboardType="number-pad"
            value={calorieGoalInput}
            onChangeText={setCalorieGoalInput}
            style={styles.input}
          />

          <Text style={styles.hint}>
            Esta meta é usada para calcular seu progresso diário e sugerir refeições ideais.
          </Text>

          <TextField2
            variant="light"
            label="Meta de proteína diária (g) · opcional"
            placeholder="Não definida"
            keyboardType="number-pad"
            value={proteinGoalInput}
            onChangeText={setProteinGoalInput}
            style={styles.input}
          />

          <Text style={styles.hint}>Bater esta meta no dia também gera XP no Ranking.</Text>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Button3 label="Salvar alterações" onPress={handleSave} loading={saving} />
        </GlassCard>

        <View style={styles.macrosIntro}>
          <Text style={styles.macrosTitle}>Distribuição de Macros</Text>
        </View>
        <ObscuredCard tint="light" borderRadius={radius3.md} style={styles.macrosCard}>
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
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.lg },

  intro: { gap: spacing3.xs },
  title: { ...typography3.headlineLgMobile, fontSize: 24 },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },

  card: { gap: spacing3.md },
  input: { marginBottom: 0 },
  error: { color: colors3.error, textAlign: 'center' },
  hint: {
    ...typography3.bodyMd,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors3.onSurfaceVariant,
    borderLeftWidth: 3,
    borderLeftColor: colors3.primary,
    paddingLeft: spacing3.sm,
  },

  macrosIntro: { marginTop: spacing3.xs },
  macrosTitle: { ...typography3.headlineMd, fontSize: 16 },
  macrosCard: {
    backgroundColor: colors3.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    gap: spacing3.md,
  },
  macroRow: { gap: spacing3.xs },
  macroRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroLabel: { ...typography3.bodyMd, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  macroValue: { ...typography3.bodyMd, fontSize: 13, color: colors3.onSurfaceVariant },
  macroBarTrack: {
    height: 6,
    borderRadius: radius3.pill,
    backgroundColor: colors3.surfaceContainer,
    overflow: 'hidden',
  },
  macroBarFill: { height: '100%', borderRadius: radius3.pill },
});
