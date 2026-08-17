import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { SelectionCard2 } from '@/components/SelectionCard2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { colors2, spacing2, typography2 } from '@/constants/theme';

// MESMOS valores de app/workout-plan/generate.tsx (LEVEL_OPTIONS/
// EQUIPMENT_OPTIONS) -- reaproveitados de proposito pra nao inventar um
// vocabulario novo pro mesmo conceito. training_level e available_equipment
// (User) usam exatamente essas strings.
const LEVEL_OPTIONS: { value: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'iniciante', label: 'Iniciante', icon: 'leaf' },
  { value: 'intermediario', label: 'Intermediario', icon: 'flame' },
  { value: 'avancado', label: 'Avancado', icon: 'flash' },
];

const EQUIPMENT_OPTIONS: { value: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'Academia completa', label: 'Academia completa', icon: 'business' },
  { value: 'Halteres em casa', label: 'Halteres em casa', icon: 'home' },
  { value: 'Peso do corpo (sem equipamento)', label: 'Peso do corpo (sem equipamento)', icon: 'body' },
];

/**
 * Passo novo: Nivel de treino + Equipamento disponivel, combinados num so
 * passo (decisao: reduzir friccao -- sao 2 perguntas curtas de selecao
 * unica, juntar evita mais uma tela inteira so pra 1 pergunta). Valores
 * identicos aos ja usados em workout-plan/generate.tsx, salvos agora no
 * perfil (training_level/available_equipment) -- ver tambem o pre-fill
 * adicionado la, que reaproveita esses mesmos campos quando existentes.
 */
export default function RegisterTrainingScreen() {
  const { draft, updateDraft } = useRegisterDraft();
  const [trainingLevel, setTrainingLevel] = useState<string | null>(draft.trainingLevel);
  const [equipment, setEquipment] = useState<string | null>(draft.equipment);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    setError(null);
    if (!trainingLevel) {
      setError('Selecione seu nivel de treino.');
      return;
    }
    if (!equipment) {
      setError('Selecione o equipamento disponivel.');
      return;
    }
    updateDraft({ trainingLevel, equipment });
    router.push('/(auth)/register-calories');
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.title}>Nivel e equipamento</Text>
          <Text style={styles.subtitle}>Vamos usar isso pra sugerir treinos que fazem sentido pra voce</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 current={5} total={getOnboardingTotalSteps(draft)} label="Treino" />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Qual o seu nivel de experiencia?</Text>
        <SelectionCard2 options={LEVEL_OPTIONS} value={trainingLevel} onChange={setTrainingLevel} />

        <Text style={styles.fieldLabel}>Qual equipamento voce tem disponivel?</Text>
        <SelectionCard2 options={EQUIPMENT_OPTIONS} value={equipment} onChange={setEquipment} />

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
  spacer: { flexGrow: 1, minHeight: spacing2.lg },
});
