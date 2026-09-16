import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { ChoiceGroup2 } from '@/components/ChoiceGroup2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { colors3, spacing3, typography3 } from '@/constants/theme';

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
    <ScreenBackground3 style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <Text style={styles.title}>Sua rotina semanal</Text>
          <Text style={styles.subtitle}>Isso ajuda a calibrar sua meta calorica com base na sua atividade real</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 variant="light" current={4} total={getOnboardingTotalSteps(draft)} label="Rotina" />
          </View>
        </View>

        <ChoiceGroup2
          variant="light"
          label="Quantas vezes por semana voce treina (musculacao)?"
          options={SESSION_COUNT_OPTIONS}
          value={trainingFrequency}
          onChange={setTrainingFrequency}
        />
        <ChoiceGroup2
          variant="light"
          label="Quantas vezes por semana voce faz cardio?"
          options={SESSION_COUNT_OPTIONS}
          value={cardioFrequency}
          onChange={setCardioFrequency}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.spacer} />

        <Button3 label="Continuar" onPress={handleContinue} />
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
});
