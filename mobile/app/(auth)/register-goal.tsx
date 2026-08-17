import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { SelectionCard2 } from '@/components/SelectionCard2';
import { TextField2 } from '@/components/TextField2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { colors2, spacing2, typography2 } from '@/constants/theme';

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
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.title}>Qual e o seu objetivo?</Text>
          <Text style={styles.subtitle}>Isso define como a IA vai montar seus treinos e planos alimentares</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 current={3} total={getOnboardingTotalSteps(draft)} label="Objetivo" />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Meta principal</Text>
        <SelectionCard2 options={GOAL_OPTIONS} value={goal} onChange={setGoal} />

        {showSpecificTarget && (
          <>
            <Text style={styles.fieldLabel}>
              {hasCurrentBodyFat ? 'Percentual de gordura alvo (opcional)' : 'Peso alvo em kg (opcional)'}
            </Text>
            {hasCurrentBodyFat ? (
              <TextField2
                label=""
                keyboardType="decimal-pad"
                value={targetBodyFatPercentage}
                onChangeText={setTargetBodyFatPercentage}
                placeholder="Ex: 15"
              />
            ) : (
              <TextField2
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
  fieldLabel: { ...typography2.bodyMd, color: colors2.onSurfaceVariant, marginLeft: spacing2.xs },
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
