import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';

import { Button3 } from '@/components/Button3';
import { GlassCard } from '@/components/GlassCard';
import { ScreenBackground3 } from '@/components/ScreenBackground3';
import { TextField2 } from '@/components/TextField2';
import { getApiErrorMessage } from '@/services/api';
import { createWeightLog, toDateString } from '@/services/weightLogs';
import { notifyDashboardChanged } from '@/utils/dashboardEvents';
import { colors3, radius3, spacing3, typography3 } from '@/constants/theme';

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Migrada direto do tema gen-1 pro claro "prism-glass" nesta tarefa
 * (colors -> colors3, Button -> Button3, TextField -> TextField2
 * variant="light", ScreenBackground3 no lugar do backgroundColor manual)
 * -- mesmo padrao ja usado em export-pdf.tsx (header com titulo + X,
 * GlassCard envolvendo o formulario, campo de data com icone de
 * calendario + botao "Concluir" no iOS). Nenhuma logica mudou: validacao,
 * createWeightLog, navegacao de volta e notifyDashboardChanged
 * continuam identicos. O DateTimePicker em si e nativo do sistema, nao
 * tem tema pra migrar.
 */
export default function NewWeightLogScreen() {
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Number(weight) > 0;

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) setDate(selectedDate);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Informe um peso valido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createWeightLog({ weight_kg: Number(weight), logged_at: toDateString(date) });
      notifyDashboardChanged();
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel registrar o peso.'));
      setSubmitting(false);
    }
  };

  return (
    <ScreenBackground3 style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Registrar peso</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors3.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GlassCard style={styles.card}>
          {!!error && <Text style={styles.error}>{error}</Text>}

          <TextField2
            variant="light"
            label="Peso (kg)"
            placeholder="Ex: 78.5"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
          />

          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Data</Text>
            <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={colors3.primary} />
              <Text style={styles.dateButtonText}>{formatDate(date)}</Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleDateChange}
                maximumDate={new Date()}
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <Button3 label="Concluir" variant="secondary" onPress={() => setShowDatePicker(false)} />
            )}
          </View>

          <Button3 label="Salvar" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
        </GlassCard>
      </ScrollView>
    </ScreenBackground3>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing3.containerMargin,
    paddingTop: spacing3.xl,
    paddingBottom: spacing3.md,
  },
  title: { ...typography3.headlineMd },
  content: { padding: spacing3.containerMargin, paddingTop: 0 },
  card: { gap: spacing3.md },
  error: { color: colors3.error, textAlign: 'center' },

  dateField: { gap: spacing3.xs, marginBottom: spacing3.sm },
  dateLabel: { ...typography3.labelSm, fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase', color: colors3.onSurfaceVariant },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing3.sm,
    backgroundColor: colors3.surfaceContainer,
    borderRadius: radius3.md,
    borderWidth: 1,
    borderColor: colors3.outlineVariant,
    paddingHorizontal: spacing3.md,
    paddingVertical: spacing3.sm + 4,
  },
  dateButtonText: { ...typography3.bodyMd, color: colors3.onSurface },
});
