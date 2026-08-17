import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { SetEntry, WorkoutDayCard } from '@/components/WorkoutDayCard';
import { WorkoutPlanData, logWorkoutSession } from '@/services/workouts';
import { colors2, radius2, spacing2, typography2 } from '@/constants/theme';

interface WorkoutPlanViewProps {
  planData: WorkoutPlanData;
  /** So a secao de IA passa isso — "gerar novo plano" nao faz sentido pra um plano montado pelo Personal Trainer. */
  onGenerateNew?: () => void;
  /**
   * "Concluir esse treino" leva pra tela de compartilhamento — nao faz
   * sentido pra um plano ainda nao salvo (etapa de revisao do formulario
   * de geracao). Default true (comportamento que ja existia) pros usos
   * normais em AiWorkoutSection/TrainerWorkoutSection.
   */
  showCompleteAction?: boolean;
  /**
   * id do WorkoutPlan ja salvo — so existe quando showCompleteAction
   * tambem faz sentido (plano ja persistido). Habilita a secao de registro
   * de peso/reps por serie (WorkoutDayCard) e e o que "Concluir esse
   * treino" usa pra salvar a sessao em workout_sessions antes de ir pra
   * tela de compartilhamento. Sem planId, a secao de registro fica
   * escondida (nao ha onde persistir).
   */
  planId?: string;
}

/**
 * Renderizacao de um plano de treino (dias + exercicios do dia
 * selecionado) — extraida do antigo (tabs)/workout.tsx pra ser
 * reaproveitada pelo plano de IA, pelo plano do Personal Trainer, e agora
 * tambem pela etapa de revisao do formulario de geracao (workout-plan/
 * generate.tsx), que so tem o WorkoutPlanData cru (plano ainda nao salvo,
 * sem id) — por isso recebe planData direto em vez do WorkoutPlan
 * completo, que so essa prop era usada mesmo. Nao reimplementa nada, so
 * generaliza o que ja existia.
 */
export function WorkoutPlanView({ planData, onGenerateNew, showCompleteAction = true, planId }: WorkoutPlanViewProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  // [indice do dia][indice do exercicio] -> series registradas. Mantido por
  // dia pra nao perder o que ja foi preenchido se a pessoa navegar entre as
  // abas de dia (ex: conferir o treino de amanha no meio do de hoje).
  const [logByDay, setLogByDay] = useState<Record<number, Record<number, SetEntry[]>>>({});
  const [saving, setSaving] = useState(false);

  const days = planData.days;
  const selectedDay = days[selectedDayIndex] ?? days[0];

  const handleSetsChange = (exerciseIndex: number, sets: SetEntry[]) => {
    setLogByDay((prev) => ({
      ...prev,
      [selectedDayIndex]: { ...prev[selectedDayIndex], [exerciseIndex]: sets },
    }));
  };

  const handleComplete = async () => {
    if (!selectedDay) return;

    if (planId) {
      setSaving(true);
      try {
        const dayLog = logByDay[selectedDayIndex] ?? {};
        await logWorkoutSession(planId, {
          day: selectedDay.day,
          focus: selectedDay.focus,
          exercises: selectedDay.exercises.map((exercise, index) => ({
            name: exercise.name,
            planned_sets: exercise.sets,
            planned_reps: exercise.reps,
            // So salva series de fato preenchidas (peso, reps ou marcadas
            // como concluidas) — linhas em branco sao so o convite visual
            // pra preencher, nao um dado real.
            sets: (dayLog[index] ?? [])
              .filter((set) => set.completed || set.weightKg.trim() || set.reps.trim())
              .map((set) => ({
                weight_kg: set.weightKg.trim() ? Number(set.weightKg.replace(',', '.')) : null,
                reps: set.reps.trim() ? Number(set.reps) : null,
                completed: set.completed,
              })),
          })),
        });
      } catch {
        Alert.alert(
          'Nao foi possivel salvar o registro',
          'O treino vai continuar pro compartilhamento, mas o peso/reps registrados nesta sessao nao foram salvos. Tente novamente mais tarde.'
        );
      } finally {
        setSaving(false);
      }
    }

    router.push({
      pathname: '/workout-plan/share',
      params: { day: JSON.stringify(selectedDay) },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>{planData.summary}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayPills}>
        {days.map((day, index) => {
          const selected = index === selectedDayIndex;
          return (
            <Pressable
              key={`${day.day}-${index}`}
              onPress={() => setSelectedDayIndex(index)}
              style={[styles.dayPill, selected && styles.dayPillSelected]}
            >
              <Text style={[styles.dayPillText, selected && styles.dayPillTextSelected]}>{day.day}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedDay && (
        <WorkoutDayCard
          day={selectedDay}
          log={planId ? logByDay[selectedDayIndex] : undefined}
          onSetsChange={planId ? handleSetsChange : undefined}
        />
      )}

      {selectedDay && showCompleteAction && (
        <Button2 label="Concluir esse treino" onPress={handleComplete} loading={saving} />
      )}

      {!!onGenerateNew && <Button2 label="Gerar novo plano" variant="secondary" onPress={onGenerateNew} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing2.md },
  summary: { ...typography2.bodyMd, color: colors2.onSurfaceVariant },
  dayPills: { gap: spacing2.sm, paddingVertical: spacing2.xs },
  dayPill: {
    paddingHorizontal: spacing2.md,
    paddingVertical: spacing2.sm,
    borderRadius: radius2.pill,
    backgroundColor: colors2.surfaceContainer,
    borderWidth: 1,
    borderColor: colors2.outlineVariant,
  },
  dayPillSelected: {
    backgroundColor: colors2.violet,
    borderColor: colors2.violet,
  },
  dayPillText: { ...typography2.bodyMd, fontSize: 14, color: colors2.onSurface },
  dayPillTextSelected: { color: colors2.white, fontWeight: '700' },
});
