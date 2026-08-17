import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { TextField2 } from '@/components/TextField2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useAuth } from '@/context/AuthContext';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { finishRegistration } from '@/services/onboarding';
import { getApiErrorMessage } from '@/services/api';
import { colors2, spacing2, typography2 } from '@/constants/theme';
import { OnboardingGoal, calculateSuggestedCalorieInfo } from '@/utils/healthCalculations';

/**
 * Passo novo: Meta calorica diaria. NAO e um campo de texto livre --
 * calculamos uma sugestao (Mifflin-St Jeor + fator de atividade real dos
 * passos anteriores + ajuste por objetivo, ver utils/healthCalculations.ts)
 * e mostramos como ponto de partida EDITAVEL, nunca como numero fixo
 * imposto. Continua editavel depois em Configuracoes (tela existente, nao
 * mexida aqui).
 *
 * Fallback generico (2000 kcal + nota) quando sexo biologico e
 * "prefiro_nao_informar" (formula nao tem coeficiente pra esse caso) ou
 * quando algum dado obrigatorio do passo Corpo faltar por algum motivo --
 * na pratica isso so aconteceria se o usuario voltasse e apagasse algo,
 * ja que altura/data de nascimento/sexo sao obrigatorios no passo 2.
 *
 * Ultimo passo do wizard quando NAO ha meta especifica (target) definida
 * no passo Objetivo -- chama finishRegistration aqui. Com meta especifica,
 * quem finaliza e register-estimate.tsx (ver la).
 */
export default function RegisterCaloriesScreen() {
  const { draft, updateDraft } = useRegisterDraft();
  const { register } = useAuth();

  const suggestion = useMemo(
    () =>
      calculateSuggestedCalorieInfo({
        weightKg: Number(draft.weight.replace(',', '.')),
        heightCm: Number(draft.height.replace(',', '.')),
        dateOfBirthIso: draft.dateOfBirth || null,
        biologicalSex: draft.biologicalSex,
        trainingSessionsPerWeek: draft.trainingFrequency ?? 0,
        cardioSessionsPerWeek: draft.cardioFrequency ?? 0,
        goal: (draft.goal ?? 'manter') as OnboardingGoal,
      }),
    [draft]
  );

  const [calorieGoal, setCalorieGoal] = useState(
    draft.dailyCalorieGoal || String(suggestion.value)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTarget = !!draft.targetBodyFatPercentage.trim() || !!draft.targetWeight.trim();

  const handleContinue = async () => {
    setError(null);
    const value = Number(calorieGoal.replace(',', '.'));
    if (!calorieGoal.trim() || Number.isNaN(value) || value <= 0) {
      setError('Informe uma meta calorica valida.');
      return;
    }

    const updatedDraft = { ...draft, dailyCalorieGoal: calorieGoal };
    updateDraft({ dailyCalorieGoal: calorieGoal });

    if (hasTarget) {
      router.push('/(auth)/register-estimate');
      return;
    }

    setLoading(true);
    try {
      await finishRegistration({ register, draft: updatedDraft });
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
          <Text style={styles.title}>Sua meta calorica diaria</Text>
          <Text style={styles.subtitle}>
            {suggestion.isGeneric
              ? 'Nao temos dados suficientes pra calcular com precisao, entao sugerimos um valor generico'
              : 'Calculamos uma sugestao com base no seu corpo, rotina e objetivo'}
          </Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 current={6} total={getOnboardingTotalSteps(draft)} label="Meta calorica" />
          </View>
        </View>

        <TextField2
          label="Meta calorica diaria (kcal)"
          keyboardType="number-pad"
          value={calorieGoal}
          onChangeText={setCalorieGoal}
          placeholder="Ex: 2200"
        />
        <Text style={styles.hint}>
          {suggestion.isGeneric
            ? 'Estimativa generica de 2000 kcal, ja que faltou algum dado do seu corpo ou voce preferiu nao informar o sexo biologico. Ajuste como preferir -- voce pode mudar isso a qualquer momento em Configuracoes.'
            : 'Isso e so um ponto de partida -- edite como quiser. Voce pode mudar essa meta depois em Configuracoes.'}
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.spacer} />

        <Button2 label={hasTarget ? 'Continuar' : 'Concluir cadastro'} onPress={handleContinue} loading={loading} />
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
  hint: {
    ...typography2.bodyMd,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors2.onSurfaceVariant,
    marginTop: -spacing2.sm,
  },
  spacer: { flexGrow: 1, minHeight: spacing2.lg },
});
