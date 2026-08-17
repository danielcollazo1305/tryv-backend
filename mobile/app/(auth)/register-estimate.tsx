import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button2 } from '@/components/Button2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useAuth } from '@/context/AuthContext';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { finishRegistration } from '@/services/onboarding';
import { getApiErrorMessage } from '@/services/api';
import { colors2, spacing2, typography2 } from '@/constants/theme';
import { OnboardingGoal, calculateGoalTimeEstimate, calculateSuggestedCalorieInfo } from '@/utils/healthCalculations';

/**
 * Passo novo (CONDICIONAL): Estimativa de tempo pro objetivo. So e
 * alcancado quando o usuario informou uma meta especifica no passo
 * Objetivo (register-goal.tsx) -- sem meta, register-calories.tsx ja
 * finalizou o cadastro e esse passo nunca aparece (sem tela vazia).
 *
 * E sempre uma ESTIMATIVA, nunca uma garantia -- texto explicito na tela.
 * Se o calculo nao for confiavel (deficit/superavit zero ou incompativel
 * com a direcao do objetivo, ver calculateGoalTimeEstimate), mostramos uma
 * mensagem alternativa em vez de um numero sem sentido.
 *
 * Ultimo passo do wizard nesse caminho -- chama finishRegistration.
 */
export default function RegisterEstimateScreen() {
  const { draft } = useRegisterDraft();
  const { register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = useMemo(() => {
    const weightKg = Number(draft.weight.replace(',', '.'));
    const currentBodyFat = draft.bodyFatPercentage.trim() ? Number(draft.bodyFatPercentage.replace(',', '.')) : null;
    const targetBodyFat = draft.targetBodyFatPercentage.trim()
      ? Number(draft.targetBodyFatPercentage.replace(',', '.'))
      : null;
    const targetWeight = draft.targetWeight.trim() ? Number(draft.targetWeight.replace(',', '.')) : null;
    const dailyCalorieGoal = Number(draft.dailyCalorieGoal.replace(',', '.'));
    const goal = (draft.goal ?? 'manter') as OnboardingGoal;

    const suggestion = calculateSuggestedCalorieInfo({
      weightKg,
      heightCm: Number(draft.height.replace(',', '.')),
      dateOfBirthIso: draft.dateOfBirth || null,
      biologicalSex: draft.biologicalSex,
      trainingSessionsPerWeek: draft.trainingFrequency ?? 0,
      cardioSessionsPerWeek: draft.cardioFrequency ?? 0,
      goal,
    });

    if (suggestion.tdee == null || !(weightKg > 0) || !(dailyCalorieGoal > 0)) return null;

    return calculateGoalTimeEstimate({
      currentWeightKg: weightKg,
      currentBodyFatPercentage: currentBodyFat,
      targetBodyFatPercentage: targetBodyFat,
      targetWeightKg: targetWeight,
      dailyCalorieGoal,
      tdee: suggestion.tdee,
      goal,
    });
  }, [draft]);

  const handleFinish = async () => {
    setError(null);
    setLoading(true);
    try {
      await finishRegistration({ register, draft });
      // Sem navegacao explicita: assim que o token e setado, o guard em
      // app/_layout.tsx troca (auth) por (tabs) automaticamente.
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel concluir o cadastro, tente novamente.'));
      setLoading(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.title}>Estimativa de tempo</Text>
          <Text style={styles.subtitle}>Uma projecao pra sua meta, com base no seu ritmo atual</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 current={7} total={getOnboardingTotalSteps(draft)} label="Estimativa" />
          </View>
        </View>

        <View style={styles.card}>
          <Ionicons name="hourglass-outline" size={32} color={colors2.primary} />
          {estimate ? (
            <>
              <Text style={styles.resultValue}>~{estimate.weeks} semanas</Text>
              <Text style={styles.resultSub}>(cerca de {estimate.months} meses)</Text>
              <Text style={styles.resultDetail}>
                Pra {estimate.wantsToLose ? 'perder' : 'ganhar'} ~{estimate.magnitudeKg} kg, no ritmo da sua meta
                calorica atual.
              </Text>
            </>
          ) : (
            <Text style={styles.resultDetail}>
              Nao temos dados suficientes pra estimar um prazo confiavel agora. Isso nao afeta o resto do seu
              cadastro -- voce pode acompanhar seu progresso real depois pelo app.
            </Text>
          )}
          <Text style={styles.disclaimer}>
            Isso e uma estimativa baseada em calculo calorico, nao uma garantia. Ritmo real varia de pessoa pra
            pessoa e pode mudar conforme seu progresso.
          </Text>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.spacer} />

        <Button2 label="Concluir cadastro" onPress={handleFinish} loading={loading} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors2.background },
  container: { flexGrow: 1, padding: spacing2.containerMargin, paddingTop: spacing2.xl * 1.5, gap: spacing2.md },
  header: { alignItems: 'center', gap: spacing2.xs, marginBottom: spacing2.sm },
  logo: { ...typography2.displayHero, fontSize: 36 },
  title: { ...typography2.headlineMd, fontSize: 20, textAlign: 'center', marginTop: spacing2.sm },
  subtitle: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, textAlign: 'center' },
  progressWrap: { width: '100%', marginTop: spacing2.md },
  error: { color: colors2.danger, textAlign: 'center' },
  spacer: { flexGrow: 1, minHeight: spacing2.lg },
  card: {
    alignItems: 'center',
    gap: spacing2.sm,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: 20,
    padding: spacing2.lg,
  },
  resultValue: { ...typography2.headlineMd, fontSize: 28, color: colors2.primary, marginTop: spacing2.xs },
  resultSub: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  resultDetail: { ...typography2.bodyMd, textAlign: 'center', marginTop: spacing2.xs },
  disclaimer: {
    ...typography2.bodyMd,
    fontSize: 12,
    fontStyle: 'italic',
    color: colors2.onSurfaceVariant,
    textAlign: 'center',
    marginTop: spacing2.sm,
  },
});
