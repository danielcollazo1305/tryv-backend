import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { LiquiglassCard } from '@/components/LiquiglassCard';
import { MultiChoiceGroup2 } from '@/components/MultiChoiceGroup2';
import { ScreenBackground2 } from '@/components/ScreenBackground2';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import { uploadMedia } from '@/services/media';
import { WorkoutExercise, WorkoutPlanData, createStudentWorkoutPlan } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

// Mesma convencao de nome de dia ja usada pelos planos de IA
// (_DAY_SCHEMA em workout_generator.py, ex: "Segunda-feira") — o trainer
// so escolhe QUAIS dias, o rotulo/valor salvo segue o mesmo padrao.
const WEEKDAY_OPTIONS: { value: string; label: string }[] = [
  { value: 'Segunda-feira', label: 'Segunda' },
  { value: 'Terça-feira', label: 'Terça' },
  { value: 'Quarta-feira', label: 'Quarta' },
  { value: 'Quinta-feira', label: 'Quinta' },
  { value: 'Sexta-feira', label: 'Sexta' },
  { value: 'Sábado', label: 'Sábado' },
  { value: 'Domingo', label: 'Domingo' },
];

// rest_seconds/notes existem no schema (reaproveitado dos planos de IA)
// mas o formulario do trainer, de proposito, so pede nome/series/reps —
// "formulario simples, sem IA" conforme o pedido. Preenchidos com um
// default neutro em vez de expor mais 2 campos que nao foram pedidos.
const DEFAULT_REST_SECONDS = 60;

interface BuilderExercise {
  id: string;
  name: string;
  sets: string;
  reps: string;
  videoUrl: string | null;
  uploadingVideo: boolean;
}

interface BuilderDay {
  dayValue: string;
  focus: string;
  exercises: BuilderExercise[];
}

function newExercise(): BuilderExercise {
  return { id: `${Date.now()}-${Math.random()}`, name: '', sets: '', reps: '', videoUrl: null, uploadingVideo: false };
}

/**
 * Builder manual de plano de treino pro personal trainer montar pra um
 * aluno especifico — fecha a lacuna que deixava TrainerWorkoutSection
 * sempre no estado vazio (nenhum endpoint existia pra isso). Sem IA
 * nenhuma: o profissional digita tudo, exercicio por exercicio.
 *
 * So cria plano novo (nao existe edicao de plano ja salvo) — o pedido nao
 * descreveu um fluxo de editar/retomar um plano existente, e o lado do
 * aluno ja trata "o plano mais recente do trainer" como o ativo (mesmo
 * criterio do plano de IA), entao criar de novo naturalmente substitui o
 * anterior na exibicao sem precisar de PATCH/edicao.
 */
export default function TrainerStudentWorkoutPlanScreen() {
  const { studentId, studentName } = useLocalSearchParams<{ studentId: string; studentName?: string }>();

  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([]);
  const [daysByWeekday, setDaysByWeekday] = useState<Record<string, BuilderDay>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChangeWeekdays = (weekdays: string[]) => {
    setSelectedWeekdays(weekdays);
    setDaysByWeekday((prev) => {
      const next: Record<string, BuilderDay> = {};
      weekdays.forEach((day) => {
        next[day] = prev[day] ?? { dayValue: day, focus: '', exercises: [] };
      });
      return next;
    });
  };

  const updateDay = (dayValue: string, patch: Partial<BuilderDay>) => {
    setDaysByWeekday((prev) => ({ ...prev, [dayValue]: { ...prev[dayValue], ...patch } }));
  };

  const addExercise = (dayValue: string) => {
    updateDay(dayValue, { exercises: [...daysByWeekday[dayValue].exercises, newExercise()] });
  };

  const updateExercise = (dayValue: string, exerciseId: string, patch: Partial<BuilderExercise>) => {
    updateDay(dayValue, {
      exercises: daysByWeekday[dayValue].exercises.map((ex) => (ex.id === exerciseId ? { ...ex, ...patch } : ex)),
    });
  };

  const removeExercise = (dayValue: string, exerciseId: string) => {
    updateDay(dayValue, { exercises: daysByWeekday[dayValue].exercises.filter((ex) => ex.id !== exerciseId) });
  };

  const handlePickVideo = async (dayValue: string, exerciseId: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permissao necessaria', 'Habilite o acesso a galeria pra anexar um video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;

    updateExercise(dayValue, exerciseId, { uploadingVideo: true });
    try {
      const url = await uploadMedia(result.assets[0].uri, 'workouts');
      updateExercise(dayValue, exerciseId, { videoUrl: url, uploadingVideo: false });
    } catch (err) {
      updateExercise(dayValue, exerciseId, { uploadingVideo: false });
      Alert.alert('Erro', getApiErrorMessage(err, 'Nao foi possivel enviar o video, tente novamente.'));
    }
  };

  const selectedDays = WEEKDAY_OPTIONS.filter((opt) => selectedWeekdays.includes(opt.value))
    .map((opt) => daysByWeekday[opt.value])
    .filter((day): day is BuilderDay => !!day);

  const canSubmit =
    selectedDays.length > 0 &&
    selectedDays.every(
      (day) =>
        day.focus.trim().length > 0 &&
        day.exercises.length > 0 &&
        day.exercises.every((ex) => ex.name.trim() && Number(ex.sets) > 0 && ex.reps.trim())
    );

  const handleSubmit = async () => {
    if (!studentId) return;
    if (!canSubmit) {
      setError('Preencha o foco e pelo menos um exercicio completo (nome, series e repeticoes) em cada dia selecionado.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const planData: WorkoutPlanData = {
        summary: 'Plano personalizado montado pelo seu personal trainer.',
        days: selectedDays.map((day) => ({
          day: day.dayValue,
          focus: day.focus.trim(),
          exercises: day.exercises.map(
            (ex): WorkoutExercise => ({
              name: ex.name.trim(),
              sets: Math.round(Number(ex.sets)),
              reps: ex.reps.trim(),
              rest_seconds: DEFAULT_REST_SECONDS,
              notes: '',
              video_url: ex.videoUrl,
            })
          ),
        })),
      };
      await createStudentWorkoutPlan(studentId, planData);
      Alert.alert('Plano salvo', `O plano de treino foi criado para ${studentName ?? 'o aluno'}.`);
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o plano.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground2 style={styles.flex}>
      <KeyboardAvoidingView style={styles.innerFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors2.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Novo plano de treino</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.studentBlock}>
            <Text style={styles.studentLabel}>Aluno</Text>
            <Text style={styles.studentName}>{studentName ?? 'Aluno'}</Text>
          </View>

          <MultiChoiceGroup2
            label="Dias da semana"
            options={WEEKDAY_OPTIONS}
            value={selectedWeekdays}
            onChange={handleChangeWeekdays}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          {selectedDays.map((day) => {
            const dayOption = WEEKDAY_OPTIONS.find((opt) => opt.value === day.dayValue)!;
            return (
              <LiquiglassCard key={day.dayValue} style={styles.dayCard}>
                <Text style={styles.dayTitle}>{dayOption.label}</Text>
                <TextField2
                  label="Foco do dia"
                  placeholder="Ex: Peito e triceps"
                  value={day.focus}
                  onChangeText={(text) => updateDay(day.dayValue, { focus: text })}
                />

                {day.exercises.map((exercise, index) => (
                  <View key={exercise.id} style={styles.exerciseBlock}>
                    <View style={styles.exerciseBlockHeader}>
                      <Text style={styles.exerciseBlockTitle}>Exercicio {index + 1}</Text>
                      <Pressable onPress={() => removeExercise(day.dayValue, exercise.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={16} color={colors2.danger} />
                      </Pressable>
                    </View>
                    <TextField2
                      label="Nome"
                      placeholder="Ex: Supino reto"
                      value={exercise.name}
                      onChangeText={(text) => updateExercise(day.dayValue, exercise.id, { name: text })}
                    />
                    <View style={styles.exerciseRow}>
                      <TextField2
                        label="Series"
                        placeholder="Ex: 4"
                        keyboardType="number-pad"
                        value={exercise.sets}
                        onChangeText={(text) => updateExercise(day.dayValue, exercise.id, { sets: text })}
                        style={styles.exerciseRowField}
                      />
                      <TextField2
                        label="Repeticoes"
                        placeholder="Ex: 10-12"
                        value={exercise.reps}
                        onChangeText={(text) => updateExercise(day.dayValue, exercise.id, { reps: text })}
                        style={styles.exerciseRowField}
                      />
                    </View>

                    {exercise.videoUrl ? (
                      <View style={styles.videoAttachedRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors2.violet} />
                        <Text style={styles.videoAttachedText}>Video anexado</Text>
                        <Pressable
                          onPress={() => updateExercise(day.dayValue, exercise.id, { videoUrl: null })}
                          hitSlop={8}
                        >
                          <Text style={styles.videoRemoveText}>Remover</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.videoButton}
                        onPress={() => handlePickVideo(day.dayValue, exercise.id)}
                        disabled={exercise.uploadingVideo}
                      >
                        {exercise.uploadingVideo ? (
                          <ActivityIndicator size="small" color={colors2.primary} />
                        ) : (
                          <Ionicons name="videocam-outline" size={16} color={colors2.primary} />
                        )}
                        <Text style={styles.videoButtonText}>
                          {exercise.uploadingVideo ? 'Enviando video...' : 'Adicionar video (opcional)'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                <Pressable style={styles.addExerciseButton} onPress={() => addExercise(day.dayValue)} hitSlop={8}>
                  <Ionicons name="add-circle-outline" size={18} color={colors2.primary} />
                  <Text style={styles.addExerciseText}>Adicionar exercicio</Text>
                </Pressable>
              </LiquiglassCard>
            );
          })}

          <Button2 label="Salvar plano" onPress={handleSubmit} loading={saving} disabled={!canSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground2>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  innerFlex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing2.containerMargin,
    paddingTop: spacing2.xl,
    paddingBottom: spacing2.md,
  },
  headerTitle: { ...typography2.headlineMd, fontSize: 18 },
  content: { padding: spacing2.containerMargin, paddingTop: 0, gap: spacing2.lg, paddingBottom: spacing2.xl },
  error: { color: colors2.danger, textAlign: 'center' },

  studentBlock: { gap: 2 },
  studentLabel: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
  studentName: { ...typography2.headlineLgMobile, fontSize: 22 },

  dayCard: { gap: spacing2.md },
  dayTitle: { ...typography2.headlineMd, fontSize: 16 },

  exerciseBlock: {
    gap: spacing2.sm,
    borderTopWidth: 1,
    borderTopColor: colors2.outlineVariant,
    paddingTop: spacing2.md,
  },
  exerciseBlockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseBlockTitle: { ...typography2.labelCaps, textTransform: 'none', color: colors2.onSurfaceVariant },
  exerciseRow: { flexDirection: 'row', gap: spacing2.sm },
  exerciseRowField: { flex: 1 },

  videoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing2.xs,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
    borderRadius: radius2.md,
    paddingVertical: spacing2.sm,
  },
  videoButtonText: { ...typography2.bodyMd, fontSize: 13, color: colors2.primary },
  videoAttachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing2.xs,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: radius2.md,
    paddingHorizontal: spacing2.sm,
    paddingVertical: spacing2.sm,
  },
  videoAttachedText: { ...typography2.bodyMd, fontSize: 13, flex: 1 },
  videoRemoveText: { ...typography2.bodyMd, fontSize: 13, color: colors2.danger },

  addExerciseButton: { flexDirection: 'row', alignItems: 'center', gap: spacing2.xs, alignSelf: 'flex-start' },
  addExerciseText: { ...typography2.bodyMd, fontSize: 13, color: colors2.primary, fontWeight: '600' },
});
