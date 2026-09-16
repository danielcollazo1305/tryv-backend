import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { SelectionCard2 } from '@/components/SelectionCard2';
import { TextField2 } from '@/components/TextField2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { colors3, spacing3, typography3 } from '@/constants/theme';

type Goal = 'emagrecer' | 'massa' | 'manter' | 'condicionamento';

const GOAL_OPTIONS: { value: Goal; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'emagrecer', label: 'Emagrecer', icon: 'trending-down' },
  { value: 'massa', label: 'Ganhar massa muscular', icon: 'barbell' },
  { value: 'manter', label: 'Manter peso', icon: 'scale' },
  { value: 'condicionamento', label: 'Melhorar condicionamento', icon: 'pulse' },
];

// Meta especifica so faz sentido pra objetivos de composicao corporal —
// "manter"/"condicionamento" nao tem uma direcao de peso/gordura clara.
const GOALS_WITH_SPECIFIC_TARGET: Goal[] = ['emagrecer', 'massa'];

/**
 * Passo 3 (Objetivo) — selecao de categoria continua identica (nao
 * mexida). NOVO: se o objetivo envolve composicao corporal (emagrecer/
 * massa), pergunta uma meta especifica OPCIONAL — percentual de gordura
 * alvo (se percentual atual foi informado no passo Corpo) ou peso alvo
 * como fallback (se nao foi). Sem meta, o passo de Estimativa de tempo
 * mais a frente simplesmente nao aparece — documentado la.
 *
 * Deixou de ser o ultimo passo do wizard (onboarding expandido) — so
 * acumula no draft e segue pro passo novo de Frequencia semanal.
 * register() so acontece no passo que realmente for o ultimo (Meta
 * Calorica ou Estimativa, ver services/onboarding.ts).
 */
export default function RegisterGoalScreen() {
  const { draft, updateDraft } = useRegisterDraft();
  const [goal, setGoal] = useState<Goal | null>((draft.goal as Goal | null) ?? null);
  const [targetBodyFatPercentage, setTargetBodyFatPercentage] = useState(draft.targetBodyFatPercentage);
  const [targetWeight, setTargetWeight] = useState(draft.targetWeight);
  const [error, setError] = useState<string | null>(null);

  const showSpecificTarget = !!goal && GOALS_WITH_SPECIFIC_TARGET.includes(goal);
  const hasCurrentBodyFat = !!draft.bodyFatPercentage.trim();

  const handleContinue = () => {
    setError(null);
    if (!goal) {
      setError('Selecione seu objetivo principal.');
      return;
    }
    updateDraft({
      goal,
      targetBodyFatPercentage: showSpecificTarget ? targetBodyFatPercentage : '',
      targetWeight: showSpecificTarget ? targetWeight : '',
    });
    router.push('/(auth)/register-frequency');
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <Text style={styles.title}>Qual e o seu objetivo?</Text>
          <Text style={styles.subtitle}>Isso define como a IA vai montar seus treinos e planos alimentares</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 variant="light" current={3} total={getOnboardingTotalSteps(draft)} label="Objetivo" />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Meta principal</Text>
        <SelectionCard2 variant="light" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />

        {showSpecificTarget && (
          <>
            <Text style={styles.fieldLabel}>
              {hasCurrentBodyFat ? 'Percentual de gordura alvo (opcional)' : 'Peso alvo em kg (opcional)'}
            </Text>
            {hasCurrentBodyFat ? (
              <TextField2
                variant="light"
                label=""
                keyboardType="decimal-pad"
                value={targetBodyFatPercentage}
                onChangeText={setTargetBodyFatPercentage}
                placeholder="Ex: 15"
              />
            ) : (
              <TextField2
                variant="light"
                label=""
                keyboardType="decimal-pad"
                value={targetWeight}
                onChangeText={setTargetWeight}
                placeholder="Ex: 70"
              />
            )}
            <Text style={styles.hint}>
              Totalmente opcional. Se voce informar uma meta, mostramos uma estimativa de tempo pra chega-la no
              fim do cadastro. Sem meta, o resto do cadastro continua normal.
            </Text>
          </>
        )}

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
  fieldLabel: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginLeft: spacing3.xs },
  error: { color: colors3.error, textAlign: 'center' },
  hint: {
    ...typography3.bodyMd,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors3.onSurfaceVariant,
    marginTop: -spacing3.sm,
  },
  spacer: { flexGrow: 1, minHeight: spacing3.lg },
});
