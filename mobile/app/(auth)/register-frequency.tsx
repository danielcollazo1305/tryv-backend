import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { colors2, spacing2, typography2 } from '@/constants/theme';

const SESSION_COUNT_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7'].map((n) => ({ value: n, label: n }));

/**
 * Passo novo: Frequencia de treino e cardio semanal. Decisao de UI: numero
 * exato (0-7, via ChoiceGroup2) em vez de faixas ("pouco/moderado/muito").
 * Motivo: getActivityLevel() (utils/healthCalculations.ts) soma treino+
 * cardio pra decidir sedentario/leve/moderado/intenso, e essa soma tambem
 * pode ser reaproveitada no futuro sem re-perguntar nada; uma faixa exigiria
 * inventar um numero representante pra cada faixa, perdendo precisao sem
 * ganhar nada em troca (a UI de chips numerados e tao rapida de preencher
 * quanto uma faixa).
 */
export default function RegisterFrequencyScreen() {
  const { draft, updateDraft } = useRegisterDraft();
  const [trainingFrequency, setTrainingFrequency] = useState<string | null>(
    draft.trainingFrequency !== null ? String(draft.trainingFrequency) : null
  );
  const [cardioFrequency, setCardioFrequency] = useState<string | null>(
    draft.cardioFrequency !== null ? String(draft.cardioFrequency) : null
  );
  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    setError(null);
    if (trainingFrequency === null || cardioFrequency === null) {
      setError('Selecione quantas vezes por semana voce treina e faz cardio.');
      return;
    }
    updateDraft({
      trainingFrequency: Number(trainingFrequency),
      cardioFrequency: Number(cardioFrequency),
    });
    router.push('/(auth)/register-training');
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.title}>Sua rotina semanal</Text>
          <Text style={styles.subtitle}>Isso ajuda a calibrar sua meta calorica com base na sua atividade real</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 current={4} total={getOnboardingTotalSteps(draft)} label="Rotina" />
          </View>
        </View>

        <ChoiceGroup2
          label="Quantas vezes por semana voce treina (musculacao)?"
          options={SESSION_COUNT_OPTIONS}
          value={trainingFrequency}
          onChange={setTrainingFrequency}
        />
        <ChoiceGroup2
          label="Quantas vezes por semana voce faz cardio?"
          options={SESSION_COUNT_OPTIONS}
          value={cardioFrequency}
          onChange={setCardioFrequency}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.spacer} />

        <Button2 label="Continuar" onPress={handleContinue} />
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
});
