import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { ProgressSteps2 } from '@/components/ProgressSteps2';
import { SelectionCard2 } from '@/components/SelectionCard2';
import { TextField2 } from '@/components/TextField2';
import { WorkoutPlanView } from '@/components/WorkoutPlanView';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { WorkoutPlanData, generateWorkoutPlan, saveWorkoutPlan } from '@/services/workouts';
import { colors3, spacing3, typography3 } from '@/constants/theme';

type Stage = 'form' | 'generating' | 'reviewing' | 'saving';

const FORM_STEPS = ['goal', 'level', 'days', 'equipment'] as const;
type FormStep = (typeof FORM_STEPS)[number];

const STEP_LABELS: Record<FormStep, string> = {
  goal: 'Objetivo',
  level: 'Nivel',
  days: 'Frequencia',
  equipment: 'Equipamento',
};

const GOAL_OPTIONS: { value: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'emagrecimento', label: 'Emagrecimento', icon: 'trending-down' },
  { value: 'hipertrofia', label: 'Hipertrofia', icon: 'barbell' },
  { value: 'resistencia', label: 'Resistencia', icon: 'pulse' },
];

const LEVEL_OPTIONS: { value: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'iniciante', label: 'Iniciante', icon: 'leaf' },
  { value: 'intermediario', label: 'Intermediario', icon: 'flame' },
  { value: 'avancado', label: 'Avancado', icon: 'flash' },
];

const DAYS_OPTIONS: { value: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
].map((value) => ({ value, label: `${value}x por semana`, icon: 'calendar' }));

const EQUIPMENT_OPTIONS: { value: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'Academia completa', label: 'Academia completa', icon: 'business' },
  { value: 'Halteres em casa', label: 'Halteres em casa', icon: 'home' },
  { value: 'Peso do corpo (sem equipamento)', label: 'Peso do corpo (sem equipamento)', icon: 'body' },
];

/**
 * Onboarding (app/(auth)/register-goal.tsx) usa um vocabulario proprio de
 * objetivo (emagrecer/massa/manter/condicionamento, salvo em User.goal) —
 * DIFERENTE do vocabulario que o gerador de treino por IA ja usava antes
 * desta tarefa (emagrecimento/hipertrofia/resistencia). Nao sao o mesmo
 * enum, entao repassar o valor cru seria impreciso. Mapeado onde o
 * sentido bate; 'manter' (manter peso) nao tem equivalente direto no
 * vocabulario de treino (que e sobre foco de treino, nao direcao de
 * peso) — nesse caso o passo fica sem pre-selecao, sem forcar uma
 * aproximacao ruim.
 */
const ONBOARDING_GOAL_MAP: Record<string, string> = {
  emagrecer: 'emagrecimento',
  massa: 'hipertrofia',
  condicionamento: 'resistencia',
};

/**
 * Migrada pro tema claro "prism-glass" nesta tarefa (colors2 -> colors3,
 * Button2 -> Button3, SelectionCard2/ProgressSteps2/TextField2/
 * WorkoutPlanView com variant="light") — tela exclusiva (nenhum outro
 * consumidor real ainda escuro pra ela mesma, so os componentes
 * compartilhados abaixo, que ganharam a prop variant em vez de edicao
 * direta). MuscleDiagram (dentro de WorkoutDayCard/WorkoutPlanView)
 * continua intocado, decisao ja tomada antes desta tarefa.
 */
export default function GenerateWorkoutScreen() {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>('form');
  const [stepIndex, setStepIndex] = useState(0);

  const [goal, setGoal] = useState<string | null>(
    user?.goal ? ONBOARDING_GOAL_MAP[user.goal] ?? null : null
  );
  // Nivel/equipamento usam o MESMO vocabulario do perfil (training_level/
  // available_equipment, onboarding expandido) -- pre-fill direto, sem
  // mapa de conversao (ao contrario do objetivo acima).
  const [level, setLevel] = useState<string | null>(user?.training_level ?? null);
  const [daysPerWeek, setDaysPerWeek] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(user?.available_equipment ?? null);
  const [notes, setNotes] = useState('');

  const [planData, setPlanData] = useState<WorkoutPlanData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentStep = FORM_STEPS[stepIndex];
  const isLastStep = stepIndex === FORM_STEPS.length - 1;

  const canProceed =
    (currentStep === 'goal' && !!goal) ||
    (currentStep === 'level' && !!level) ||
    (currentStep === 'days' && !!daysPerWeek) ||
    (currentStep === 'equipment' && !!equipment);

  const handleBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((prev) => prev - 1);
  };

  const handleGenerate = async () => {
    if (!goal || !level || !daysPerWeek || !equipment) return;
    setError(null);
    setStage('generating');
    try {
      const result = await generateWorkoutPlan({
        goal,
        level,
        days_per_week: Number(daysPerWeek),
        equipment,
        notes: notes.trim() || undefined,
      });
      setPlanData(result);
      setStage('reviewing');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o plano de treino, tente novamente.'));
      // Volta pro formulario sem perder nenhuma resposta ja dada — fica na
      // ultima etapa (equipamento), de onde o usuario pode tentar de novo.
      setStage('form');
    }
  };

  const handleContinue = () => {
    if (!canProceed) return;
    if (isLastStep) {
      handleGenerate();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const handleConfirm = async () => {
    if (!planData) return;
    setStage('saving');
    setError(null);
    try {
      await saveWorkoutPlan(planData);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o plano.'));
      setStage('reviewing');
    }
  };

  const handleDiscard = () => {
    setStage('form');
    setPlanData(null);
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Ionicons
            name={stage === 'form' && stepIndex > 0 ? 'arrow-back' : 'close'}
            size={24}
            color={colors3.onSurfaceVariant}
          />
        </Pressable>
        <Text style={styles.headerTitle}>
          {stage === 'form' || stage === 'generating' ? 'Gerar treino' : 'Revisar plano'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        {stage === 'form' && (
          <>
            <ProgressSteps2
              current={stepIndex + 1}
              total={FORM_STEPS.length}
              label={STEP_LABELS[currentStep]}
              variant="light"
            />

            {currentStep === 'goal' && (
              <>
                <Text style={styles.fieldLabel}>Qual e o seu objetivo com o treino?</Text>
                <SelectionCard2 options={GOAL_OPTIONS} value={goal} onChange={setGoal} variant="light" />
              </>
            )}

            {currentStep === 'level' && (
              <>
                <Text style={styles.fieldLabel}>Qual o seu nivel de experiencia?</Text>
                <SelectionCard2 options={LEVEL_OPTIONS} value={level} onChange={setLevel} variant="light" />
              </>
            )}

            {currentStep === 'days' && (
              <>
                <Text style={styles.fieldLabel}>Quantos dias por semana voce pode treinar?</Text>
                <SelectionCard2 options={DAYS_OPTIONS} value={daysPerWeek} onChange={setDaysPerWeek} variant="light" />
              </>
            )}

            {currentStep === 'equipment' && (
              <>
                <Text style={styles.fieldLabel}>Qual equipamento voce tem disponivel?</Text>
                <SelectionCard2 options={EQUIPMENT_OPTIONS} value={equipment} onChange={setEquipment} variant="light" />
                <TextField2
                  variant="light"
                  label="Observacoes (opcional)"
                  placeholder="Ex: dor no joelho, prefiro treinos curtos..."
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  style={styles.notesInput}
                />
              </>
            )}

            <Button3
              label={isLastStep ? 'Gerar treino' : 'Continuar'}
              onPress={handleContinue}
              disabled={!canProceed}
            />
          </>
        )}

        {stage === 'generating' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors3.primary} />
            <Text style={styles.generatingText}>Montando seu treino...</Text>
          </View>
        )}

        {(stage === 'reviewing' || stage === 'saving') && planData && (
          <View style={styles.reviewContainer}>
            <WorkoutPlanView planData={planData} showCompleteAction={false} variant="light" />

            <Button3 label="Confirmar e salvar" onPress={handleConfirm} loading={stage === 'saving'} />
            <Button3
              label="Descartar e gerar outro"
              variant="secondary"
              onPress={handleDiscard}
              disabled={stage === 'saving'}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors3.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  headerTitle: { ...typography3.headlineMd, fontSize: 18 },
  content: { padding: spacing3.containerMargin, paddingTop: 0, gap: spacing3.md },
  error: { color: colors3.error, textAlign: 'center', marginBottom: spacing3.sm },
  fieldLabel: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginBottom: -spacing3.xs },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  centered: { alignItems: 'center', marginTop: spacing3.xl },
  generatingText: { ...typography3.bodyMd, color: colors3.onSurfaceVariant, marginTop: spacing3.md },
  reviewContainer: { gap: spacing3.md },
});
