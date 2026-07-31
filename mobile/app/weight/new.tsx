import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { getApiErrorMessage } from '@/services/api';
import { createWeightLog, toDateString } from '@/services/weightLogs';
import { notifyDashboardChanged } from '@/utils/dashboardEvents';
import { colors, radius, spacing, typography } from '@/constants/theme';

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

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
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Registrar peso</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        <TextField
          label="Peso (kg)"
          placeholder="Ex: 78.5"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
        />

        <View style={styles.dateField}>
          <Text style={styles.dateLabel}>Data</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
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
            <Button label="Concluir" variant="secondary" onPress={() => setShowDatePicker(false)} />
          )}
        </View>

        <Button label="Salvar" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  content: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  error: { color: colors.danger, textAlign: 'center' },

  dateField: { gap: spacing.xs, marginBottom: spacing.sm },
  dateLabel: { ...typography.caption, color: colors.textSecondary },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  dateButtonText: { ...typography.body, color: colors.text },
});
