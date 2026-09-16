import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { FreeWorkoutLogView } from '@/components/FreeWorkoutLogView';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { colors3, spacing3, typography3 } from '@/constants/theme';

/**
 * Tela do registro de treino "livre" (sem plano) — ponto de entrada
 * universal a partir do card "Começar treino" da Home (TodayWorkoutCard)
 * quando nao ha plano de IA ativo pra hoje. Wrapper fino (header + fundo),
 * mesmo padrao de workout-plan/generate.tsx — a logica de verdade mora em
 * FreeWorkoutLogView.tsx (reutilizavel, sem depender de rota).
 */
export default function FreeWorkoutSessionScreen() {
  const handleDone = () => {
    Alert.alert('Treino registrado!', 'Seu treino livre foi salvo com sucesso.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors3.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Treino livre</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <FreeWorkoutLogView onDone={handleDone} />
      </View>
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
    paddingTop: Platform.OS === 'ios' ? spacing3.xl : spacing3.xl + 12,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  content: { flex: 1, paddingHorizontal: spacing3.containerMargin, paddingBottom: spacing3.md },
});
