import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button2 } from '@/components/Button2';
import { WorkoutDayCard } from '@/components/WorkoutDayCard';
import { WorkoutPlanData } from '@/services/workouts';
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
export function WorkoutPlanView({ planData, onGenerateNew, showCompleteAction = true }: WorkoutPlanViewProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const days = planData.days;
  const selectedDay = days[selectedDayIndex] ?? days[0];

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

      {selectedDay && <WorkoutDayCard day={selectedDay} />}

      {selectedDay && showCompleteAction && (
        <Button2
          label="Concluir esse treino"
          onPress={() =>
            router.push({
              pathname: '/workout-plan/share',
              params: { day: JSON.stringify(selectedDay) },
            })
          }
        />
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
