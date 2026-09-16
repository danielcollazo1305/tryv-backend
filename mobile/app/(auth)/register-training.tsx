import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { SelectionCard2 } from '@/components/SelectionCard2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { useRegisterDraft } from '@/context/RegisterDraftContext';
import { colors3, spacing3, typography3 } from '@/constants/theme';

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
    <ScreenBackground3 style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv Fit</Text>
          <Text style={styles.title}>Nivel e equipamento</Text>
          <Text style={styles.subtitle}>Vamos usar isso pra sugerir treinos que fazem sentido pra voce</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 variant="light" current={5} total={getOnboardingTotalSteps(draft)} label="Treino" />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Qual o seu nivel de experiencia?</Text>
        <SelectionCard2 variant="light" options={LEVEL_OPTIONS} value={trainingLevel} onChange={setTrainingLevel} />

        <Text style={styles.fieldLabel}>Qual equipamento voce tem disponivel?</Text>
        <SelectionCard2 variant="light" options={EQUIPMENT_OPTIONS} value={equipment} onChange={setEquipment} />

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
  spacer: { flexGrow: 1, minHeight: spacing3.lg },
});
