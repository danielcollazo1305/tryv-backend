import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { SelectionCard2 } from '@/components/SelectionCard2';
import { TextField2 } from '@/components/TextField2';
import { getOnboardingTotalSteps } from '@/constants/onboardingSteps';
import { BiologicalSex, useRegisterDraft } from '@/context/RegisterDraftContext';
import { toDateString } from '@/services/weightLogs';
import { colors2, spacing2, typography2 } from '@/constants/theme';

const SEX_OPTIONS: { value: BiologicalSex; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'masculino', label: 'Masculino', icon: 'male' },
  { value: 'feminino', label: 'Feminino', icon: 'female' },
  { value: 'prefiro_nao_informar', label: 'Prefiro nao informar', icon: 'help-circle-outline' },
];

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Passo 2 (Corpo) — onboarding expandido. Peso (passo 1), altura, data de
 * nascimento e sexo biologico agora sao OBRIGATORIOS (decisao explicita
 * do pedido): o calculo de meta calorica sugerida (passo mais a frente)
 * perde muito sentido sem eles, e esse calculo e o motivo central desta
 * expansao. Percentual de gordura corporal fica sempre OPCIONAL — poucas
 * pessoas sabem esse numero de cabeca, forcar isso so aumentaria a
 * friccao do cadastro sem necessidade (a meta calorica funciona bem sem
 * ele, ver utils/healthCalculations.ts).
 *
 * "Sexo biologico" tem 3 opcoes, incluindo "Prefiro nao informar" — a
 * formula de metabolismo basal (Mifflin-St Jeor) so tem coeficiente pra
 * masculino/feminino, mas por respeito a privacidade a opcao existe;
 * escolhendo ela, a meta calorica cai no fallback generico (2000 kcal,
 * documentado no passo de Meta Calorica) em vez de travar o cadastro.
 */
export default function RegisterBodyScreen() {
  const { draft, updateDraft } = useRegisterDraft();
  const [height, setHeight] = useState(draft.height);
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(
    draft.dateOfBirth ? new Date(`${draft.dateOfBirth}T00:00:00`) : null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | null>(draft.biologicalSex);
  const [bodyFatPercentage, setBodyFatPercentage] = useState(draft.bodyFatPercentage);
  const [error, setError] = useState<string | null>(null);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) setDateOfBirth(selectedDate);
  };

  const handleContinue = () => {
    setError(null);
    const heightValue = Number(height.replace(',', '.'));
    if (!height.trim() || Number.isNaN(heightValue) || heightValue <= 0) {
      setError('Informe sua altura.');
      return;
    }
    if (!dateOfBirth) {
      setError('Informe sua data de nascimento.');
      return;
    }
    if (!biologicalSex) {
      setError('Selecione uma opcao de sexo biologico.');
      return;
    }

    updateDraft({
      height,
      dateOfBirth: toDateString(dateOfBirth),
      biologicalSex,
      bodyFatPercentage,
    });
    router.push('/(auth)/register-goal');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Tryv</Text>
          <Text style={styles.title}>Fale sobre o seu corpo</Text>
          <Text style={styles.subtitle}>Usamos isso para calcular suas necessidades caloricas com precisao</Text>

          <View style={styles.progressWrap}>
            <ProgressSteps2 current={2} total={getOnboardingTotalSteps(draft)} label="Corpo" />
          </View>
        </View>

        <TextField2
          label="Altura (cm)"
          keyboardType="number-pad"
          value={height}
          onChangeText={setHeight}
          placeholder="Ex: 175"
        />

        <View style={styles.dateField}>
          <Text style={styles.fieldLabel}>Data de nascimento</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={18} color={colors2.primary} />
            <Text style={styles.dateButtonText}>
              {dateOfBirth ? formatDate(dateOfBirth) : 'Selecionar data'}
            </Text>
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={dateOfBirth ?? new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
          )}
          {Platform.OS === 'ios' && showDatePicker && (
            <Button2 label="Confirmar data" variant="secondary" onPress={() => setShowDatePicker(false)} />
          )}
        </View>

        <Text style={styles.fieldLabel}>Sexo biologico</Text>
        <SelectionCard2 options={SEX_OPTIONS} value={biologicalSex} onChange={setBiologicalSex} />

        <TextField2
          label="Percentual de gordura corporal (opcional)"
          keyboardType="decimal-pad"
          value={bodyFatPercentage}
          onChangeText={setBodyFatPercentage}
          placeholder="Ex: 18"
        />
        <Text style={styles.hint}>
          Se voce souber esse numero, ele deixa a meta calorica mais precisa. Pode deixar em branco se nao souber.
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button2 label="Continuar" onPress={handleContinue} />
      </ScrollView>
    </KeyboardAvoidingView>
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

  dateField: { gap: spacing2.xs },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.sm,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.md,
  },
  dateButtonText: { ...typography2.bodyMd, color: colors2.onSurface },
});
