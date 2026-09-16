import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button3 } from '@/components/Button3';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useAuth } from '@/context/AuthContext';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { finishRegistration } from '@/services/onboarding';
import { getApiErrorMessage } from '@/services/api';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';
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
    <ScreenBackground3 style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <Text style={styles.title}>Estimativa de tempo</Text>
          <Text style={styles.subtitle}>Uma projecao pra sua meta, com base no seu ritmo atual</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 variant="light" current={7} total={getOnboardingTotalSteps(draft)} label="Estimativa" />
          </View>
        </View>

        <View style={styles.card}>
          <Ionicons name="hourglass-outline" size={32} color={colors3.primary} />
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

        <Button3 label="Concluir cadastro" onPress={handleFinish} loading={loading} />
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing3.containerMargin, paddingTop: spacing3.xl * 1.5, gap: spacing3.md },
  header: { alignItems: 'center', gap: spacing3.xs, marginBottom: spacing3.sm },
  logo: { ...typography3.displayLg, fontSize: 36, fontWeight: '800', color: colors3.primary },
  title: { ...typography3.headlineMd, fontSize: 20, textAlign: 'center', marginTop: spacing3.sm },
  subtitle: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, textAlign: 'center' },
  progressWrap: { width: '100%', marginTop: spacing3.md },
  error: { color: colors3.error, textAlign: 'center' },
  spacer: { flexGrow: 1, minHeight: spacing3.lg },
  card: {
    alignItems: 'center',
    gap: spacing3.sm,
    backgroundColor: colors3.surfaceContainer,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    borderRadius: radius3.xl,
    padding: spacing3.lg,
  },
  resultValue: { ...typography3.headlineMd, fontSize: 28, color: colors3.primary, marginTop: spacing3.xs },
  resultSub: { ...typography3.bodyMd, color: colors3.onSurfaceVariant },
  resultDetail: { ...typography3.bodyMd, textAlign: 'center', marginTop: spacing3.xs },
  disclaimer: {
    ...typography3.bodyMd,
    fontSize: 12,
    fontStyle: 'italic',
    color: colors3.onSurfaceVariant,
    textAlign: 'center',
    marginTop: spacing3.sm,
  },
});
